import axios from "axios";

const DEALSEEK_BASE_URL = 'https://newestdealflow.dealseek.com/deals';
const DEALSEEK_PARAMS = {
    percentOff: 0,
    sortBy: 'recommended',
    useStackingDiscount: true,
    hasCoupon: true,
    hasPromoCode: true,
    hasLightningDeal: true,
    hasExtraDiscount: true,
    hasPriceDrop: true,
    hasBrandDeal: false,
    hasCommissionDeal: true,
    hasCreatorConnectionDeal: false,
    userId: '18a25b3b-725c-42f8-8136-631afe00d0a5',
    semantic_search: true
};

// Mapea un item de la API DealSeek a la estructura usada por la app
function mapDealItem(item) {
    const asin = item.asin || item.parent_asin;
    const title = item.title || '';
    // Construir handle desde el título (slug simplificado)
    const handle = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 80);

    return {
        id: asin,
        asin,
        handle,  // expuesto para que el cliente construya URLs localizadas
        title,
        image_url: item.image || '',
        price: item.discounted_price ?? item.price ?? null,
        list_price: item.list_price ?? null,
        discount: item.discount_percentage ? `${item.discount_percentage}%` : null,
        coupon_value: item.coupon_value || null,
        stacking_discount_percentage: item.stacking_discount_percentage ?? null,
        has_coupon: item.has_coupon || false,
        has_lightning_deal: item.has_lightning_deal || false,
        has_price_drop: item.has_price_drop || false,
        has_extra_discount: item.has_extra_discount || false,
        has_promo_code: item.has_promo_code || false,
        is_amazon_choice: item.is_amazon_choice || false,
        category: item.category || '',
        merchant_name: item.merchant_name || '',
        ratings_count: item.ratings_count || 0,
        avg_rating: item.avg_rating || 0,
        bought_past_month: item.bought_past_month || 0,
        promo_string: item.promo_string || '',
        discounts: item.discounts || [],
        // URL base sin language/currency — el cliente las añade según su país
        amznUrl: buildCustomUrl(handle, asin),
        timestamp: new Date().toISOString()
    };
}

// Función principal para obtener productos de DealSeek
export const getAmazonProducts = async (page = 1, limit = 20, query = '') => {
    try {
        console.log(`🔄 Preparando llamada a DealSeek: page=${page}, limit=${limit}, query="${query}"`);

        // Usamos parámetros exactos del URL que funciona, como strings para evitar errores de serialización
        const params = {
            page: String(page),
            limit: String(limit),
            percentOff: "0",
            query: query.trim(),
            sortBy: "recommended",
            useStackingDiscount: "true",
            hasCoupon: "true",
            hasPromoCode: "true",
            hasLightningDeal: "true",
            hasExtraDiscount: "true",
            hasPriceDrop: "true",
            hasBrandDeal: "false",
            hasCommissionDeal: "true",
            hasCreatorConnectionDeal: "false",
            userId: "18a25b3b-725c-42f8-8136-631afe00d0a5",
            semantic_search: "true"
        };

        // Si no hay query, lo quitamos para no enviar "query=" vacío
        if (!params.query) delete params.query;

        // Log de la URL final reconstruida para comparar
        const qs = new URLSearchParams(params).toString();
        console.log(`🔗 URL de llamada: ${DEALSEEK_BASE_URL}?${qs}`);

        const response = await axios.get(DEALSEEK_BASE_URL, {
            params,
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 15000
        });

        const rawItems = Array.isArray(response.data)
            ? response.data
            : (response.data.deals || response.data.data || response.data.items || []);

        console.log(`✅ DealSeek respondió con ${rawItems.length} items`);

        const products = rawItems.map(mapDealItem);

        return {
            page,
            limit,
            query: query || null,
            products_count: products.length,
            products
        };

    } catch (error) {
        console.error('❌ Error obteniendo deals:', error.message);
        throw error;
    }
};



// Función para construir la URL personalizada de Amazon con tag de afiliado
function buildCustomUrl(handle, productId, tag = 'wizofertas-20', language = 'es_US') {
    try {
        const encodedHandle = encodeURIComponent(handle).replace(/%20/g, '+');
        return `https://www.amazon.com/${encodedHandle}/dp/${productId}?tag=${tag}&language=${language}&currency=COP`;
    } catch (error) {
        console.error('Error construyendo URL personalizada:', error.message);
        return null;
    }
}
