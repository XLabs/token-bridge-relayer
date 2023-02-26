const axios = require("axios"); // import breaks

export async function getCoingeckoPrices(tokens: string[] | string) {
  tokens = typeof tokens === "string" ? tokens : tokens.join(",");
  const { data, status } = await axios.get(
    `https://api.coingecko.com/api/v3/simple/price?ids=${tokens}&vs_currencies=usd`,
    {
      headers: {
        Accept: "application/json",
      },
    }
  );

  if (status != 200) {
    throw new Error("status != 200");
  }

  return data;
}
