import express from "express";
import path from "path";

import { getAmazonProducts, scrapeAmazonProduct } from './utils.js';

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

// Aplicar el middleware a todas las rutas del router
apiRouter.use(validateDomain);

// Endpoint 1: Listado de productos
apiRouter.get('/products', async (req, res) => {
    try {
        const API_URL = 'https://r.jina.ai/https://www.amazon.com/deals?language=es_US&_encoding=UTF8&discounts-widget=%22{\%22state\%22:{\%22rangeRefinementFilters\%22:{\%22percentOff\%22:{\%22min\%22:20,\%22max\%22:80}}},\%22version\%22:1}%22';

        const resultado = await getAmazonProducts(API_URL);

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

// Endpoint 2: Datos de un solo producto
apiRouter.get('/product', async (req, res) => {
    try {
        const { url } = req.query;

        if (!url) {
            return res.status(400).json({
                success: false,
                error: 'El parámetro "url" es requerido'
            });
        }

        const resultado = await scrapeAmazonProduct(url);

        if (resultado.success) {
            res.json({
                success: true,
                data: resultado.data
            });
        } else {
            res.status(500).json({
                success: false,
                error: resultado.error
            });
        }

    } catch (error) {
        console.error('❌ Error en endpoint /api/product:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
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