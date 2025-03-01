import { useEffect, useState } from "react";

import {
  DEPOSIT_TOKENS_JAR_NAMES,
  getPriceId,
  JAR_DEPOSIT_TOKENS,
  PICKLE_JARS,
} from "./jars";
import { Prices } from "../Prices";
import {
  Contracts,
  COMETH_USDC_WETH_REWARDS,
  COMETH_PICKLE_MUST_REWARDS,
  COMETH_MATIC_MUST_REWARDS,
  MATIC_COMPLEX_REWARDER,
} from "../Contracts";
import { Jar } from "./useFetchJars";
import { useComethPairDayData } from "./useComethPairDayData";
import { useSushiPairDayData } from "./useSushiPairDayData";
import { useQuickPairDayData } from "./useQuickPairDayData";
import { formatEther } from "ethers/lib/utils";
import { ComethPairs } from "../ComethPairs";
import { SushiPairs } from "../SushiPairs";

import { Connection } from "../Connection";
import fetch from "node-fetch";
import AaveStrategyAbi from "../ABIs/aave-strategy.json";
import MasterchefAbi from "../ABIs/masterchef.json";
import IronchefAbi from "../ABIs/ironchef.json";
import FossilFarmsAbi from "../ABIs/fossil-farms.json";
import { ethers } from "ethers";
import { useCurveRawStats } from "./useCurveRawStats";
import { useCurveAm3MaticAPY } from "./useCurveAm3MaticAPY";
import { NETWORK_NAMES, ChainName } from "containers/config";
import erc20 from "@studydefi/money-legos/erc20";
import { Contract as MulticallContract } from "ethers-multicall";

const AVERAGE_BLOCK_TIME = 2;
export interface JarApy {
  [k: string]: number;
}

interface SushiPoolId {
  [key: string]: number;
}

const sushiPoolIds: SushiPoolId = {
  "0xc2755915a85c6f6c1c0f3a86ac8c058f11caa9c9": 2,
  "0xc4e595acdd7d12fec385e5da5d43160e8a0bac0e": 0,
  "0x57602582eb5e82a197bae4e8b6b80e39abfc94eb": 37,
};

interface DinoPoolId {
  [key: string]: number;
}

const dinoPoolIds: DinoPoolId = {
  "0x3324af8417844e70b81555A6D1568d78f4D4Bf1f": 10,
  "0x9f03309A588e33A239Bf49ed8D68b2D45C7A1F11": 11,
};

export interface JarWithAPY extends Jar {
  totalAPY: number;
  apr: number;
  lp: number;
  APYs: Array<JarApy>;
}

type Input = Array<Jar> | null;
type Output = {
  jarsWithAPY: Array<JarWithAPY> | null;
};

const getCompoundingAPY = (apr: number) => {
  return 100 * (Math.pow(1 + apr / 365, 365) - 1);
};

export const useJarWithAPY = (network: ChainName, jars: Input): Output => {
  const { multicallProvider, provider } = Connection.useContainer();
  const {
    controller,
    strategy,
    sushiMinichef,
    sushiComplexRewarder,
    ironchef,
    fossilFarms,
  } = Contracts.useContainer();
  const { prices } = Prices.useContainer();
  const { getPairData: getComethPairData } = ComethPairs.useContainer();
  const { getPairData: getSushiPairData } = SushiPairs.useContainer();
  const { stakingRewards } = Contracts.useContainer();
  const { getComethPairDayAPY } = useComethPairDayData();
  const { getSushiPairDayAPY } = useSushiPairDayData();
  const { getQuickPairDayAPY } = useQuickPairDayData();
  const [jarsWithAPY, setJarsWithAPY] = useState<Array<JarWithAPY> | null>(
    null,
  );

  const { rawStats: curveRawStats } = useCurveRawStats(NETWORK_NAMES.POLY);
  const { APYs: am3CrvAPY } = useCurveAm3MaticAPY();

  const calculateComethAPY = async (rewardsAddress: string) => {
    if (
      stakingRewards &&
      prices?.must &&
      getComethPairData &&
      multicallProvider
    ) {
      const multicallStakingRewards = new MulticallContract(
        rewardsAddress,
        stakingRewards.interface.fragments,
      );

      const [
        rewardsDurationBN,
        rewardsForDurationBN,
        stakingToken,
        totalSupplyBN,
      ] = await multicallProvider.all([
        multicallStakingRewards.rewardsDuration(),
        multicallStakingRewards.getRewardForDuration(),
        multicallStakingRewards.stakingToken(),
        multicallStakingRewards.totalSupply(),
      ]);

      const totalSupply = parseFloat(formatEther(totalSupplyBN));
      const rewardsDuration = rewardsDurationBN.toNumber(); //epoch
      const rewardsForDuration = parseFloat(formatEther(rewardsForDurationBN));

      const { pricePerToken } = await getComethPairData(stakingToken);

      const rewardsPerYear =
        rewardsForDuration * ((360 * 24 * 60 * 60) / rewardsDuration);
      const valueRewardedPerYear = prices.must * rewardsPerYear;

      const totalValueStaked = totalSupply * pricePerToken;
      const apy = valueRewardedPerYear / totalValueStaked;

      return [{ must: getCompoundingAPY(apy * 0.8), apr: apy * 0.8 * 100 }];
    }

    return [];
  };

  const calculateAaveAPY = async (
    assetAddress: string,
    strategyAddress: string,
  ) => {
    const pools = await fetch(
      "https://aave-api-v2.aave.com/data/liquidity/v2?poolId=0xd05e3E715d945B59290df0ae8eF85c1BdB684744",
    ).then((response) => response.json());
    const pool = pools?.find(
      (pool) =>
        pool.underlyingAsset.toUpperCase() === assetAddress.toUpperCase(),
    );

    if (!pool || !prices?.matic || !multicallProvider) return [];

    const aaveStrategy = new MulticallContract(
      strategyAddress,
      AaveStrategyAbi,
    );
    const [supplied, borrowed, balance] = (
      await multicallProvider.all([
        aaveStrategy.getSuppliedView(),
        aaveStrategy.getBorrowedView(),
        aaveStrategy.balanceOfPool(),
      ])
    ).map((x) => ethers.utils.formatEther(x));

    const rawSupplyAPY = +pool["avg1DaysLiquidityRate"];
    const rawBorrowAPY = +pool["avg1DaysVariableBorrowRate"];

    const supplyMaticAPR =
      (+pool.aEmissionPerSecond * 365 * 3600 * 24 * prices.matic) /
      +pool["totalLiquidity"] /
      +pool["referenceItem"]["priceInUsd"];
    const borrowMaticAPR =
      (+pool.vEmissionPerSecond * 365 * 3600 * 24 * prices.matic) /
      +pool["totalDebt"] /
      +pool["referenceItem"]["priceInUsd"];

    const maticAPR =
      (supplied * supplyMaticAPR + borrowed * borrowMaticAPR) /
      (balance * 1e18);

    const rawAPY =
      (rawSupplyAPY * supplied - rawBorrowAPY * borrowed) / balance;

    return [
      { lp: rawAPY * 100 },
      { matic: getCompoundingAPY(maticAPR * 0.8), apr: maticAPR * 0.8 * 100 },
    ];
  };

  const calculateSushiAPY = async (lpTokenAddress: string) => {
    if (
      sushiMinichef &&
      prices?.sushi &&
      getSushiPairData &&
      multicallProvider &&
      sushiComplexRewarder
    ) {
      const poolId = sushiPoolIds[lpTokenAddress];
      const multicallsushiMinichef = new MulticallContract(
        sushiMinichef.address,
        sushiMinichef.interface.fragments,
      );
      const lpToken = new MulticallContract(lpTokenAddress, erc20.abi);

      const [
        sushiPerSecondBN,
        totalAllocPointBN,
        poolInfo,
        totalSupplyBN,
      ] = await multicallProvider.all([
        multicallsushiMinichef.sushiPerSecond(),
        multicallsushiMinichef.totalAllocPoint(),
        multicallsushiMinichef.poolInfo(poolId),
        lpToken.balanceOf(sushiMinichef.address),
      ]);

      const totalSupply = parseFloat(formatEther(totalSupplyBN));
      const sushiRewardsPerSecond =
        (parseFloat(formatEther(sushiPerSecondBN)) *
          poolInfo.allocPoint.toNumber()) /
        totalAllocPointBN.toNumber();

      const { pricePerToken } = await getSushiPairData(lpTokenAddress);

      const sushiRewardsPerYear = sushiRewardsPerSecond * (365 * 24 * 60 * 60);
      const valueRewardedPerYear = prices.sushi * sushiRewardsPerYear;

      const totalValueStaked = totalSupply * pricePerToken;
      const sushiAPY = valueRewardedPerYear / totalValueStaked;

      // Getting MATIC rewards
      const [
        totalAllocPointCREncoded,
        poolInfoCR,
        maticPerSecondBN,
      ] = await Promise.all([
        provider.getStorageAt(MATIC_COMPLEX_REWARDER, 5),
        sushiComplexRewarder.poolInfo(poolId),
        sushiComplexRewarder.rewardPerSecond(),
      ]);

      const totalAllocPointCR = ethers.utils.defaultAbiCoder.decode(
        ["uint256"],
        totalAllocPointCREncoded,
      );

      const maticRewardsPerSecond =
        (parseFloat(formatEther(maticPerSecondBN)) *
          poolInfoCR.allocPoint.toNumber()) /
        totalAllocPointCR[0].toNumber();

      const maticRewardsPerYear = maticRewardsPerSecond * (365 * 24 * 60 * 60);

      const maticValueRewardedPerYear = prices.matic * maticRewardsPerYear;

      const maticAPY = maticValueRewardedPerYear / totalValueStaked;

      return [
        { sushi: getCompoundingAPY(sushiAPY * 0.8), apr: sushiAPY * 0.8 * 100 },
        { matic: getCompoundingAPY(maticAPY * 0.8), apr: maticAPY * 0.8 * 100 },
      ];
    }

    return [];
  };

  const calculateIronChefAPY = async (jar: Jar | undefined) => {
    if (
      prices &&
      multicallProvider &&
      ironchef &&
      controller &&
      strategy &&
      jar
    ) {
      const jarStrategy = await controller.strategies(jar.depositToken.address);
      const strategyContract = await strategy.attach(jarStrategy);
      const ironchefAddress = await strategyContract.ironchef();
      const poolId = await strategyContract.poolId();
      const ice = "0x4a81f8796e0c6ad4877a51c86693b0de8093f2ef";
      const pricePerToken = 1;

      const multicallIronchef = new MulticallContract(
        ironchefAddress,
        IronchefAbi,
      );

      const lpToken = new MulticallContract(
        jar.depositToken.address,
        erc20.abi,
      );

      const [
        icePerSecondBN,
        totalAllocPointBN,
        poolInfo,
        totalSupplyBN,
      ] = await multicallProvider.all([
        multicallIronchef.rewardPerSecond(),
        multicallIronchef.totalAllocPoint(),
        multicallIronchef.poolInfo(poolId),
        lpToken.balanceOf(ironchefAddress),
      ]);

      const totalSupply = parseFloat(formatEther(totalSupplyBN));
      const icePerSecond =
        (parseFloat(formatEther(icePerSecondBN)) *
          poolInfo.allocPoint.toNumber()) /
        totalAllocPointBN.toNumber();

      const iceRewardsPerYear = icePerSecond * (365 * 24 * 60 * 60);
      const valueRewardedPerYear = prices.ice * iceRewardsPerYear;

      const totalValueStaked = totalSupply * pricePerToken;
      const iceAPY = valueRewardedPerYear / totalValueStaked;

      return [
        { ice: getCompoundingAPY(iceAPY * 0.8), apr: iceAPY * 0.8 * 100 },
      ];
    }
    return [];
  };

  const calculateMasterChefAPY = async (jar: Jar | undefined) => {
    if (prices && multicallProvider && jar && controller && strategy) {
      const jarStrategy = await controller.strategies(jar.depositToken.address);
      const strategyContract = await strategy.attach(jarStrategy);
      const masterchefAddress = await strategyContract.masterChef();
      const poolId = await strategyContract.poolId();
      const rewardTokenAddress = await strategyContract.rewardToken();
      const multicallMasterchef = new MulticallContract(
        masterchefAddress,
        MasterchefAbi,
      );

      const lpToken = new MulticallContract(
        jar.depositToken.address,
        erc20.abi,
      );

      const [
        sushiPerBlockBN,
        totalAllocPointBN,
        poolInfo,
        totalSupplyBN,
      ] = await multicallProvider.all([
        multicallMasterchef.rewardPerBlock(),
        multicallMasterchef.totalAllocPoint(),
        multicallMasterchef.poolInfo(poolId),
        lpToken.balanceOf(masterchefAddress),
      ]);

      const totalSupply = parseFloat(formatEther(totalSupplyBN));
      const rewardsPerBlock =
        (parseFloat(formatEther(sushiPerBlockBN)) *
          0.9 *
          poolInfo.allocPoint.toNumber()) /
        totalAllocPointBN.toNumber();

      const { pricePerToken } = await getSushiPairData(
        jar.depositToken.address,
      );

      const rewardsPerYear =
        rewardsPerBlock * ((360 * 24 * 60 * 60) / AVERAGE_BLOCK_TIME);
      const rewardToken = getPriceId(rewardTokenAddress);
      const valueRewardedPerYear = prices[rewardToken] * rewardsPerYear;

      const totalValueStaked = totalSupply * pricePerToken;
      const rewardAPY = valueRewardedPerYear / totalValueStaked;

      return [
        {
          [rewardToken]: getCompoundingAPY(rewardAPY * 0.8),
          apr: rewardAPY * 0.8 * 100,
        },
      ];
    }

    return [];
  };

  const calculateFossilFarmsAPY = async (jar: Jar | undefined) => {
    if (
      prices &&
      multicallProvider &&
      jar &&
      controller &&
      strategy &&
      fossilFarms
    ) {
      const multicallFossilFarms = new MulticallContract(
        fossilFarms.address,
        fossilFarms.interface.fragments,
      );

      const lpToken = new MulticallContract(
        jar.depositToken.address,
        erc20.abi,
      );

      const [
        dinoPerBlockBN,
        totalAllocPointBN,
        poolInfo,
        totalSupplyBN,
      ] = await multicallProvider.all([
        multicallFossilFarms.dinoPerBlock(),
        multicallFossilFarms.totalAllocPoint(),
        multicallFossilFarms.poolInfo(dinoPoolIds[jar.depositToken.address]),
        lpToken.balanceOf(fossilFarms.address),
      ]);

      const totalSupply = parseFloat(formatEther(totalSupplyBN));
      const rewardsPerBlock =
        (parseFloat(formatEther(dinoPerBlockBN)) *
          0.9 *
          poolInfo.allocPoint.toNumber()) /
        totalAllocPointBN.toNumber();

      const { pricePerToken } = await getSushiPairData(
        jar.depositToken.address,
      );

      const rewardsPerYear =
        rewardsPerBlock * ((360 * 24 * 60 * 60) / AVERAGE_BLOCK_TIME);
      const dinoRewardedPerYear = prices.dino * rewardsPerYear;

      const totalValueStaked = totalSupply * pricePerToken;
      const dinoAPY = dinoRewardedPerYear / totalValueStaked;

      return [
        {
          dino: getCompoundingAPY(dinoAPY * 0.8),
          apr: dinoAPY * 0.8 * 100,
        },
      ];
    }

    return [];
  };

  const calculateAPY = async () => {
    if (jars && controller && strategy) {
      const usdcMimaticJar = jars.find(
        (jar) =>
          jar.depositToken.address ===
          JAR_DEPOSIT_TOKENS[NETWORK_NAMES.POLY].QUICK_MIMATIC_USDC,
      );

      const qiMimaticJar = jars.find(
        (jar) =>
          jar.depositToken.address ===
          JAR_DEPOSIT_TOKENS[NETWORK_NAMES.POLY].QUICK_MIMATIC_QI,
      );

      const qiMaticJar = jars.find(
        (jar) =>
          jar.depositToken.address ===
          JAR_DEPOSIT_TOKENS[NETWORK_NAMES.POLY].QUICK_MATIC_QI,
      );

      const iron3usdJar = jars.find(
        (jar) =>
          jar.depositToken.address ===
          JAR_DEPOSIT_TOKENS[NETWORK_NAMES.POLY].IRON_3USD,
      );

      const dinoUsdcJar = jars.find(
        (jar) =>
          jar.depositToken.address ===
          JAR_DEPOSIT_TOKENS[NETWORK_NAMES.POLY].POLY_SUSHI_DINO_USDC,
      );

      const dinoWethJar = jars.find(
        (jar) =>
          jar.depositToken.address ===
          JAR_DEPOSIT_TOKENS[NETWORK_NAMES.POLY].QUICK_DINO_WETH,
      );

      const [
        comethUsdcWethApy,
        comethPickleMustApy,
        comethMaticMustApy,
        aaveDaiAPY,
        sushiEthUsdtApy,
        sushiMaticEthApy,
        sushiPickleDaiApy,
        quickMimaticUsdcApy,
        quickMimaticQiApy,
        iron3usdApy,
        dinoUsdcApy,
        dinoWethApy,
        quickMaticQiApy,
      ] = await Promise.all([
        calculateComethAPY(COMETH_USDC_WETH_REWARDS),
        calculateComethAPY(COMETH_PICKLE_MUST_REWARDS),
        calculateComethAPY(COMETH_MATIC_MUST_REWARDS),
        calculateAaveAPY(
          JAR_DEPOSIT_TOKENS[NETWORK_NAMES.POLY].DAI,
          "0x0b198b5EE64aB29c98A094380c867079d5a1682e",
        ),
        calculateSushiAPY(
          JAR_DEPOSIT_TOKENS[NETWORK_NAMES.POLY].POLY_SUSHI_ETH_USDT,
        ),
        calculateSushiAPY(
          JAR_DEPOSIT_TOKENS[NETWORK_NAMES.POLY].POLY_SUSHI_MATIC_ETH,
        ),
        calculateSushiAPY(
          JAR_DEPOSIT_TOKENS[NETWORK_NAMES.POLY].POLY_SUSHI_PICKLE_DAI,
        ),
        calculateMasterChefAPY(usdcMimaticJar),
        calculateMasterChefAPY(qiMimaticJar),
        calculateIronChefAPY(iron3usdJar),
        calculateFossilFarmsAPY(dinoUsdcJar),
        calculateFossilFarmsAPY(dinoWethJar),
        calculateMasterChefAPY(qiMaticJar),
      ]);

      const promises = jars.map(async (jar) => {
        let APYs: Array<JarApy> = [];

        if (jar.jarName === DEPOSIT_TOKENS_JAR_NAMES.COMETH_USDC_WETH) {
          APYs = [
            ...comethUsdcWethApy,
            ...getComethPairDayAPY(
              JAR_DEPOSIT_TOKENS[NETWORK_NAMES.POLY].COMETH_USDC_WETH,
            ),
          ];
        }

        if (jar.jarName === DEPOSIT_TOKENS_JAR_NAMES.COMETH_PICKLE_MUST) {
          APYs = [
            ...comethPickleMustApy,
            ...getComethPairDayAPY(
              JAR_DEPOSIT_TOKENS[NETWORK_NAMES.POLY].COMETH_PICKLE_MUST,
            ),
          ];
        }

        if (jar.jarName === DEPOSIT_TOKENS_JAR_NAMES.COMETH_MATIC_MUST) {
          APYs = [
            ...comethMaticMustApy,
            ...getComethPairDayAPY(
              JAR_DEPOSIT_TOKENS[NETWORK_NAMES.POLY].COMETH_MATIC_MUST,
            ),
          ];
        }

        if (jar.jarName === DEPOSIT_TOKENS_JAR_NAMES.DAI) {
          APYs = [...aaveDaiAPY];
        }

        if (jar.jarName === DEPOSIT_TOKENS_JAR_NAMES.AM3CRV) {
          APYs = [
            { lp: (curveRawStats?.aave || 0) + am3CrvAPY[0].lp },
            ...[am3CrvAPY[1]],
            ...[am3CrvAPY[2]],
          ];
        }

        if (jar.jarName === DEPOSIT_TOKENS_JAR_NAMES.POLY_SUSHI_ETH_USDT) {
          APYs = [
            ...sushiEthUsdtApy,
            ...getSushiPairDayAPY(
              JAR_DEPOSIT_TOKENS[NETWORK_NAMES.POLY].POLY_SUSHI_ETH_USDT,
            ),
          ];
        }

        if (jar.jarName === DEPOSIT_TOKENS_JAR_NAMES.POLY_SUSHI_MATIC_ETH) {
          APYs = [
            ...sushiMaticEthApy,
            ...getSushiPairDayAPY(
              JAR_DEPOSIT_TOKENS[NETWORK_NAMES.POLY].POLY_SUSHI_MATIC_ETH,
            ),
          ];
        }

        if (jar.jarName === DEPOSIT_TOKENS_JAR_NAMES.POLY_SUSHI_PICKLE_DAI) {
          APYs = [
            ...sushiPickleDaiApy,
            ...getSushiPairDayAPY(
              JAR_DEPOSIT_TOKENS[NETWORK_NAMES.POLY].POLY_SUSHI_PICKLE_DAI,
            ),
          ];
        }

        if (jar.jarName === DEPOSIT_TOKENS_JAR_NAMES.QUICK_MIMATIC_USDC) {
          APYs = [
            ...quickMimaticUsdcApy,
            ...getQuickPairDayAPY(
              JAR_DEPOSIT_TOKENS[NETWORK_NAMES.POLY].QUICK_MIMATIC_USDC,
            ),
          ];
        }

        if (jar.jarName === DEPOSIT_TOKENS_JAR_NAMES.QUICK_MIMATIC_QI) {
          APYs = [
            ...quickMimaticQiApy,
            ...getQuickPairDayAPY(
              JAR_DEPOSIT_TOKENS[NETWORK_NAMES.POLY].QUICK_MIMATIC_QI,
            ),
          ];
        }

        if (jar.jarName === DEPOSIT_TOKENS_JAR_NAMES.QUICK_MATIC_QI) {
          APYs = [
            ...quickMaticQiApy,
            ...getQuickPairDayAPY(
              JAR_DEPOSIT_TOKENS[NETWORK_NAMES.POLY].QUICK_MATIC_QI,
            ),
          ];
        }

        if (jar.jarName === DEPOSIT_TOKENS_JAR_NAMES.IRON_3USD) {
          APYs = [...iron3usdApy];
        }

        if (jar.jarName === DEPOSIT_TOKENS_JAR_NAMES.POLY_SUSHI_DINO_USDC) {
          APYs = [
            ...dinoUsdcApy,
            ...getSushiPairDayAPY(
              JAR_DEPOSIT_TOKENS[NETWORK_NAMES.POLY].POLY_SUSHI_DINO_USDC,
            ),
          ];
        }

        if (jar.jarName === DEPOSIT_TOKENS_JAR_NAMES.QUICK_DINO_WETH) {
          APYs = [
            ...dinoWethApy,
            ...getQuickPairDayAPY(
              JAR_DEPOSIT_TOKENS[NETWORK_NAMES.POLY].QUICK_DINO_WETH,
            ),
          ];
        }

        let apr = 0;
        APYs.map((x) => {
          if (x.apr) {
            apr += x.apr;
            delete x.apr;
          }
        });

        let lp = 0;
        APYs.map((x) => {
          if (x.lp) {
            lp += x.lp;
          }
        });

        const totalAPY = getCompoundingAPY(apr / 100) + lp;

        return {
          ...jar,
          APYs,
          totalAPY,
          apr,
          lp,
        };
      });

      const newJarsWithAPY = await Promise.all(promises);

      setJarsWithAPY(newJarsWithAPY);
    }
  };

  useEffect(() => {
    if (network === NETWORK_NAMES.POLY) calculateAPY();
  }, [jars?.length, prices, network]);

  return { jarsWithAPY };
};
