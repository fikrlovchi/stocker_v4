const SHOPS_URL = "https://api-seller.uzum.uz/api/seller-openapi/v1/shops";
const TIMEOUT_MS = 10000;

// Uzum seller-openapi: Authorization sarlavhasi "Bearer" prefiksisiz, xom token.
async function fetchShops(token) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(SHOPS_URL, {
      headers: { Authorization: token, Accept: "*/*" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Uzum API xatosi (${response.status}): ${(await response.text()).slice(0, 300)}`);
    }
    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error("Uzum API kutilmagan javob qaytardi");
    }
    return data.map((shop) => ({ shopId: String(shop.id), name: shop.name }));
  } catch (e) {
    if (e.name === "AbortError") throw new Error("Uzum API javob bermadi (timeout)");
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { fetchShops };
