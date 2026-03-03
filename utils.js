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
export const getAmazonProducts = async (page = 1, limit = 50) => {
    try {
        console.log(`🔄 Obteniendo deals de DealSeek (página ${page}, limit ${limit})...`);

        const params = new URLSearchParams({
            page,
            limit,
            ...DEALSEEK_PARAMS
        });

        const url = `${DEALSEEK_BASE_URL}?${params.toString()}`;

        const response = await axios.get(url, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 15000
        });

        console.log('✅ Datos recibidos, procesando...');

        // La API devuelve un array de deals directamente o en una propiedad
        const rawItems = Array.isArray(response.data)
            ? response.data
            : (response.data.deals || response.data.data || response.data.items || []);

        const products = rawItems.map(mapDealItem);

        return {
            page,
            limit,
            products_count: products.length,
            products
        };

    } catch (error) {
        console.error('❌ Error obteniendo deals:', error.message);
        throw error;
    }
};

// Función principal para scrapear un producto individual
export const scrapeAmazonProduct = async (productUrl, customSelectors = null) => {
    try {
        console.log(`🔄 Scrapeando producto: ${productUrl}`);

        const scraperUrl = buildDataProductUrl(productUrl, customSelectors);

        const response = await axios.get(scraperUrl, {
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        console.log('✅ Datos obtenidos de la API, formateando...');

        const formattedData = formatProductData(response.data);

        return {
            success: true,
            data: formattedData
        };

    } catch (error) {
        console.error('❌ Error scrapeando producto:', error.message);
        return {
            success: false,
            url: productUrl,
            error: error.message,
            data: null
        };
    }
};

// Función para construir la URL de la API de scraping
function buildDataProductUrl(productUrl, selectors = null) {
    const baseUrl = 'https://web.scraper.workers.dev/';

    const defaultSelectors = [
        '#productTitle',
        '.savingsPercentage',
        '.po-brand .a-span9',
        '.po-special_feature .a-span9',
        '.po-item_depth_width_height .a-span9',
        '#feature-bullets .a-list-item',
        '.priceToPay',
        '.basisPrice .a-offscreen',
        '#acrPopover',
        '.a-icon-alt',
        '#acrCustomerReviewText',
        '#availability .a-color-success',
        '#merchant-info',
        '#social-proofing-faceout-title-tk_bought'
    ].join(',');

    const selectorParam = selectors || defaultSelectors;
    const encodedProductUrl = encodeURIComponent(productUrl);

    return `${baseUrl}?url=${encodedProductUrl}&selector=${encodeURIComponent(selectorParam)}&scrape=text&pretty=true`;
}

// Función para limpiar y formatear los datos del scraper
function formatProductData(rawData) {
    if (!rawData || !rawData.result) {
        return { error: 'Datos no válidos' };
    }

    const { result } = rawData;

    const cleanText = (text) => {
        if (!text) return '';
        return String(text)
            .replace(/&#34;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .trim();
    };

    const getFirst = (array, defaultValue = '') => {
        return array && array.length > 0 ? cleanText(array[0]) : defaultValue;
    };

    const extractPrice = (priceText) => {
        if (!priceText) return null;
        const match = String(priceText).match(/(\d+[.,]\d+)/);
        return match ? parseFloat(match[1].replace(',', '.')) : null;
    };

    const extractPercentage = (percentageText) => {
        if (!percentageText) return null;
        const match = String(percentageText).match(/(-?\d+%)/);
        return match ? match[1] : null;
    };

    const extractRating = (ratingText) => {
        if (!ratingText) return null;
        const match = String(ratingText).match(/(\d+[.,]\d+)/);
        return match ? parseFloat(match[1]) : null;
    };

    return {
        basic_info: {
            title: getFirst(result['#productTitle']),
            brand: getFirst(result['.po-brand .a-span9']),
            stock: getFirst(result['#availability .a-color-success'], 'Disponible')
        },
        prices: {
            current_price: getFirst(result['.priceToPay']),
            current_price_number: extractPrice(getFirst(result['.priceToPay'])),
            original_price: getFirst(result['.basisPrice .a-offscreen']),
            original_price_number: extractPrice(getFirst(result['.basisPrice .a-offscreen'])),
            discount_percent: extractPercentage(getFirst(result['.savingsPercentage'])),
            percent: result['.savingsPercentage'] ? getFirst(result['.savingsPercentage']) : null
        },
        features: {
            special_features: getFirst(result['.po-special_feature .a-span9']),
            dimensions: getFirst(result['.po-item_depth_width_height .a-span9']),
            list_features: result['#feature-bullets .a-list-item']
                ? result['#feature-bullets .a-list-item'].map(cleanText)
                : []
        },
        rates: {
            rating_stars: extractRating(getFirst(result['.a-icon-alt'])),
            rating_count: getFirst(result['#acrCustomerReviewText']),
            frequently_buy: getFirst(result['#social-proofing-faceout-title-tk_bought'])
        },
        seller: {
            info_seller: getFirst(result['#merchant-info'])
        },
        metadata: {
            timestamp: new Date().toISOString(),
            elements_found: Object.keys(result).length
        }
    };
}

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
