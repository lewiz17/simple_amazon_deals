import axios from "axios";

// Función principal para obtener y parsear los datos

export const getAmazonProducts = async (apiUrl) => {
    try {
        console.log('🔄 Obteniendo datos de la API...');

        const response = await axios.get(apiUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/markdown, text/plain, */*'
            },
            timeout: 15000
        });

        console.log('✅ Datos recibidos, procesando...');

        // Parsear el markdown
        const products = parseAmazonMarkdownEnhanced(response.data);

        // Resultado final
        const result = {
            products_count: products.length,
            products: products
        };

        return result;

    } catch (error) {
        console.error('❌ Error:', error.message);
        throw error;
    }
}

// Función mejorada para limpiar y normalizar datos

export const parseAmazonMarkdownEnhanced = (markdownContent) => {
    const products = [];

    // Usar una expresión regular más robusta para capturar cada producto completo
    const productRegex = /(\[!\[Image \d+: ([^\]]+)\]\(([^)]+)\)\]\(([^)]+)\))\s*(\[([^\]]+)\]\(([^)]+)\))/g;

    let match;
    while ((match = productRegex.exec(markdownContent)) !== null) {
        const product = {};

        // Datos de la imagen
        product.title = match[2].trim();
        product.image_url = transformImageUrl(match[3].trim());
        let enlace_imagen = match[4].trim();

        // Datos del descuento y descripción
        const discountText = match[6].trim();
        let enlace_producto = match[7].trim();

        // Extraer handle de ambos enlaces
        let handle_imagen = extractHandleFromUrl(enlace_imagen);
        let handle_producto = extractHandleFromUrl(enlace_producto);

        // Usar el handle del producto como principal
        product.handle = handle_producto || handle_imagen;

        // Extraer porcentaje de descuento
        const percentMatch = discountText.match(/(-?\d+%)/);
        if (percentMatch) {
            product.discount = percentMatch[1];
        }

        // Extraer descripción limpia
        const cleanDesc = discountText
            .replace(/^(-?\d+%\s*)?(Oferta Relámpago\s*)?/, '') // Remover porcentaje y "Oferta Relámpago"
            .replace(/\s*[^-]+\s*\.\.\.$/, '') // Remover texto truncado (...)
            .trim();

        product.description = cleanDesc;

        // Extraer ID del producto de cualquier URL
        const idMatch1 = enlace_imagen.match(/\/dp\/([A-Z0-9]{10})/);
        const idMatch2 = enlace_producto.match(/\/dp\/([A-Z0-9]{10})/);

        if (idMatch1) {
            product.id = idMatch1[1];
        } else if (idMatch2) {
            product.id = idMatch2[1];
        }

        product.amznUrl = buildCustomUrl(product.handle, product.id);

        // Agregar timestamp
        product.timestamp = new Date().toISOString();

        products.push(product);
    }

    return products;
}

// Función principal para scrapear un producto
export const scrapeAmazonProduct = async (productUrl, customSelectors = null) => {
    try {
        console.log(`🔄 Scrapeando producto: ${productUrl}`);

        const scraperUrl = buildDataProductUrl(productUrl, customSelectors);

        console.log(scraperUrl);

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
}


// Función para construir la URL de la API de scraping
function buildDataProductUrl(productUrl, selectors = null) {
    const baseUrl = 'https://web.scraper.workers.dev/';

    // Selectores por defecto para productos Amazon
    const defaultSelectors = [
        '#productTitle',
        '.savingsPercentage',
        '.po-brand .a-span9',
        '.po-special_feature .a-span9',
        '.po-item_depth_width_height .a-span9',
        '#feature-bullets .a-list-item',
        '.priceToPay',
        '.basisPrice .a-offscreen',
        '#acrPopover', // ratings
        '.a-icon-alt', // star rating
        '#acrCustomerReviewText', // number of reviews
        '#availability .a-color-success', // availability
        '#merchant-info', // seller info
        '#social-proofing-faceout-title-tk_bought' // frequently bought
    ].join(',');

    const selectorParam = selectors || defaultSelectors;

    // Codificar la URL del producto y los selectores
    const encodedProductUrl = encodeURIComponent(`${productUrl}`);

    return `${baseUrl}?url=${encodedProductUrl}&selector=${encodeURIComponent(selectorParam)}&scrape=text&pretty=true`;
}


// Función para limpiar y formatear los datos de la API
function formatProductData(rawData) {
    if (!rawData || !rawData.result) {
        return { error: 'Datos no válidos' };
    }

    const { result } = rawData;

    // Función helper para limpiar texto HTML
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

    // Función helper para obtener el primer elemento o string vacío
    const getFirst = (array, defaultValue = '') => {
        return array && array.length > 0 ? cleanText(array[0]) : defaultValue;
    };

    // Función helper para extraer precio numérico
    const extractPrice = (priceText) => {
        if (!priceText) return null;
        const match = String(priceText).match(/(\d+[.,]\d+)/);
        return match ? parseFloat(match[1].replace(',', '.')) : null;
    };

    // Función helper para extraer porcentaje
    const extractPercentage = (percentageText) => {
        if (!percentageText) return null;
        const match = String(percentageText).match(/(-?\d+%)/);
        return match ? match[1] : null;
    };

    // Función helper para extraer rating
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
            discpunt_percent: extractPercentage(getFirst(result['.savingsPercentage'])),
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

// Función para construir la URL personalizada
function buildCustomUrl(handle, productId, tag = 'topbeauty0d-20', language = 'es_US') {
    try {
        // Codificar el handle para la URL
        const encodedHandle = encodeURIComponent(handle).replace(/%20/g, '+');

        // Construir la URL en el formato deseado
        const customUrl = `https://www.amazon.com/${encodedHandle}/dp/${productId}?tag=${tag}&language=${language}&currency=COP`;

        return customUrl;
    } catch (error) {
        console.error('Error construyendo URL personalizada:', error.message);
        return null;
    }
}

// Función para limpiar y transformar la URL de imagen
function transformImageUrl(originalUrl) {
    try {
        // Remover todos los parámetros después del ?
        const baseUrl = originalUrl.split('?')[0];

        // Reemplazar el patrón _AC_SF226,226_QL85_ por _AC_SF1000,1000_QL85_
        const transformedUrl = baseUrl.replace(/_AC_SF\d+,\d+_QL85_/, '_AC_SF1000,1000_QL85_');

        return transformedUrl;
    } catch (error) {
        console.error('Error transformando URL:', error.message);
        return originalUrl;
    }
}

function extractHandleFromUrl(url) {
    try {
        // Patrón para encontrar lo que está entre .com/ y /dp
        const pattern = /\.com\/([^\/]+)\/dp\//;
        const match = url.match(pattern);

        if (match && match[1]) {
            // Decodificar el handle (URL decode)
            const decodedHandle = decodeURIComponent(match[1]);
            return decodedHandle.toLowerCase();
        }

        return null;
    } catch (error) {
        console.error('Error decodificando URL:', error.message);
        return null;
    }
}

