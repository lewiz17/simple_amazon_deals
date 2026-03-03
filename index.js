import express from "express";
import path from "path";

import { getAmazonProducts } from './utils.js';

const app = express();
const PORT = process.env.PORT || 3000;

const __dirname = path.resolve();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));


// Obtener dominios permitidos desde environment variables
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['http://localhost:3000'];

function validateDomain(req, res, next) {
    const origin = req.headers.origin;

    // Verificar si el origin está permitido
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
    } else if (process.env.NODE_ENV !== 'production') {
        // En desarrollo, permitir cualquier origen
        res.header('Access-Control-Allow-Origin', '*');
    }

    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');

    // Manejar preflight OPTIONS
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    next();
}

const apiRouter = express.Router();

// Middleware de seguridad por API Key (solo para /products)
const API_SECRET_KEY = process.env.API_SECRET_KEY || 'wz-secret-2024';

function requireApiKey(req, res, next) {
    const origin = req.headers.origin;
    // Permitir solicitudes sin origin (mismo servidor / SSR)
    if (!origin) return next();

    const providedKey = req.headers['x-api-key'] || req.query._k;
    if (providedKey !== API_SECRET_KEY) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    next();
}

// Aplicar el middleware a todas las rutas del router
apiRouter.use(validateDomain);

// Endpoint 1: Listado de productos (con paginación y búsqueda)
apiRouter.get('/products', requireApiKey, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const query = req.query.query || req.query.q || '';

        const resultado = await getAmazonProducts(page, limit, query);

        res.json({
            success: true,
            data: resultado
        });

    } catch (error) {
        console.error('❌ Error en endpoint /api/products:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});


// Endpoint 3: Geo-detección server-side (sin CORS)
apiRouter.get('/geo', async (req, res) => {
    try {
        // Obtener IP real del cliente (funciona detrás de proxies / Render / Railway)
        const forwarded = req.headers['x-forwarded-for'];
        const clientIp = forwarded
            ? forwarded.split(',')[0].trim()
            : req.socket?.remoteAddress || req.ip || '';

        // En localhost no hay IP pública — retornar fallback
        const isLocal = !clientIp || clientIp === '::1' || clientIp === '127.0.0.1' || clientIp === '::ffff:127.0.0.1';
        if (isLocal) {
            return res.json({ success: true, data: null, message: 'local' });
        }

        const geoRes = await axios.get(
            `http://ip-api.com/json/${clientIp}?fields=status,countryCode,currency,country`,
            { timeout: 5000 }
        );

        if (geoRes.data?.status === 'success') {
            const { countryCode, currency, country } = geoRes.data;
            res.json({ success: true, data: { countryCode, currency, country } });
        } else {
            res.json({ success: false, data: null });
        }
    } catch (err) {
        console.error('❌ Error en /api/geo:', err.message);
        res.json({ success: false, data: null });
    }
});

apiRouter.get('/gaid', async (req, res) => {
    const gaId = process.env.GA_ID;

    // Validar formato del GA ID (ej: G-XXXXXXXXXX o UA-XXXXXXXX-X)
    const isValidGaId = gaId && /^(G-|UA-|GTM-)[A-Z0-9-]+$/i.test(gaId);


    if (!isValidGaId) {
        return res.status(200).json({
            enabled: false,
            message: 'Google Analytics not configured'
        });
    }

    res.status(200).json({
        enabled: true,
        gaId: gaId,
        measurementId: gaId.startsWith('G-') ? gaId : undefined,
        trackingId: gaId.startsWith('UA-') ? gaId : undefined
    });
});

// Endpoint de salud
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString()
    });
});

app.use('/api', apiRouter);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`);
});

export default app;