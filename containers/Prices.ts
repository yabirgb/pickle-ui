import { useState, useEffect } from "react";
import { createContainer } from "unstated-next";
import CoinGecko from "coingecko-api";

interface PriceObject {
  dai: number;
  comp: number;
  eth: number;
  susd: number;
  pickle: number;
  usdt: number;
  usdc: number;
  crv: number;
  snx: number;
  uni: number;
  sushi: number;
  yfi: number;
  wbtc: number;
  bas: number;
  bac: number;
  mis: number;
  mic: number;
  ldo: number;
  yvecrv: number;
  mir: number;
  ust: number;
  mtsla: number;
  maapl: number;
  mqqq: number;
  mslv: number;
  mbaba: number;
  fei: number;
  tribe: number;
  lusd: number;
  frax: number;
  lqty: number;
  must: number;
  matic: number;
  yvboost: number;
  alcx: number;
  fxs: number;
  luna: number;
  mimatic: number;
  qi: number;
  cvx: number;
  ice: number;
  mim: number;
  spell: number;
  fox: number;
  dino: number;
  cherry: number;
  wokt: number;
  ethk: number;
  btck: number;
  tru: number;
  bxh: number;
  bal: number;
  rly: number;
  hnd: number;
  dodo: number;
}

export type PriceIds = keyof PriceObject;

function usePrices() {
  const [prices, setPrices] = useState<PriceObject | null>(null);

  const getPrices = async () => {
    const CoinGeckoClient = new CoinGecko();
    const { data: response } = await CoinGeckoClient.simple.price({
      ids: [
        "pickle-finance",
        "ethereum",
        "dai",
        "usd-coin",
        "compound-governance-token",
        "curve-dao-token",
        "tether",
        "uniswap",
        "havven",
        "nusd",
        "wrapped-bitcoin",
        "sushi",
        "yearn-finance",
        "basis-share",
        "basis-cash",
        "mithril-share",
        "mith-cash",
        "lido-dao",
        "mirror-protocol",
        "terrausd",
        "mirrored-tesla",
        "mirrored-apple",
        "mirrored-invesco-qqq-trust",
        "mirrored-ishares-silver-trust",
        "mirrored-alibaba",
        "vecrv-dao-yvault",
        "fei-protocol",
        "tribe-2",
        "liquity-usd",
        "liquity",
        "frax",
        "frax-share",
        "must",
        "matic-network",
        "magic-internet-money",
        "spell-token",
        // "yvboost",
        "alchemix",
        "terra-luna",
        "mimatic",
        "qi-dao",
        "convex-finance",
        "iron-finance",
        "shapeshift-fox-token",
        "dinoswap",
        "cherryswap",
        "okexchain",
        "truefi",
        "bxh",
        "balancer",
        "rally-2",
        "hundred-finance",
        "dodo"
      ],
      vs_currencies: ["usd"],
    });

    const prices: PriceObject = {
      dai: response.dai.usd,
      comp: response["compound-governance-token"].usd,
      eth: response.ethereum.usd,
      susd: response.nusd.usd,
      pickle: response["pickle-finance"].usd,
      usdt: response.tether.usd,
      usdc: response["usd-coin"].usd,
      crv: response["curve-dao-token"].usd,
      snx: response["havven"].usd,
      uni: response["uniswap"].usd,
      sushi: response["sushi"].usd,
      yfi: response["yearn-finance"].usd,
      wbtc: response["wrapped-bitcoin"].usd,
      bas: response["basis-share"].usd,
      bac: response["basis-cash"].usd,
      mis: response["mithril-share"].usd,
      mic: response["mith-cash"].usd,
      ldo: response["lido-dao"].usd,
      yvecrv: response["vecrv-dao-yvault"].usd,
      mir: response["mirror-protocol"].usd,
      ust: response["terrausd"].usd,
      mtsla: response["mirrored-tesla"].usd,
      maapl: response["mirrored-apple"].usd,
      mqqq: response["mirrored-invesco-qqq-trust"].usd,
      mslv: response["mirrored-ishares-silver-trust"].usd,
      mbaba: response["mirrored-alibaba"].usd,
      fei: response["fei-protocol"].usd,
      tribe: response["tribe-2"].usd,
      lusd: response["liquity-usd"].usd,
      lqty: response["liquity"].usd,
      frax: response["frax"].usd,
      fxs: response["frax-share"].usd,
      must: response["must"].usd,
      matic: response["matic-network"].usd,
      yvboost: 0, // to update once CG provides yvboost price
      alcx: response["alchemix"].usd,
      luna: response["terra-luna"].usd,
      mimatic: response["mimatic"].usd,
      qi: response["qi-dao"].usd,
      cvx: response["convex-finance"].usd,
      ice: response["iron-finance"].usd,
      spell: response["spell-token"].usd,
      mim: response["magic-internet-money"].usd,
      fox: response["shapeshift-fox-token"].usd,
      dino: response["dinoswap"].usd,
      cherry: response["cherryswap"].usd,
      wokt: response["okexchain"].usd,
      ethk: response.ethereum.usd,
      btck: response["wrapped-bitcoin"].usd,
      tru: response["truefi"].usd,
      bxh: response["bxh"].usd,
      bal: response["balancer"].usd,
      rly: response["rally-2"].usd,
      hnd: response["hundred-finance"].usd,
      dodo: response["dodo"].usd,
    };
    setPrices(prices);
  };

  useEffect(() => {
    getPrices();
    setInterval(() => getPrices(), 120000);
  }, []);

  return { prices };
}

export const Prices = createContainer(usePrices);
