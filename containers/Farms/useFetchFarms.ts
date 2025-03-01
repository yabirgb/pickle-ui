import { useState, useEffect } from "react";
import { BigNumber, Contract } from "ethers";

import { Connection } from "../Connection";
import { Contracts } from "../Contracts";
import { NETWORK_NAMES } from "containers/config";
import { X } from "@geist-ui/react-icons";
import { Contract as MulticallContract } from "ethers-multicall";

export interface RawFarm {
  lpToken: string;
  poolIndex: number;
  allocPoint: BigNumber;
  lastRewardTime: BigNumber;
  accPicklePerShare: BigNumber;
}

export const useFetchFarms = (): { rawFarms: Array<RawFarm> | null } => {
  const { blockNum, multicallProvider, chainName } = Connection.useContainer();
  const {
    minichef: minichefContract,
  } = Contracts.useContainer();
  const masterchef =
    chainName === NETWORK_NAMES.ETH ? null : minichefContract;

  const [farms, setFarms] = useState<Array<RawFarm> | null>(null);

  const getFarms = async () => {
    if (masterchef && multicallProvider) {
      const poolLengthBN = (await masterchef.poolLength()) as BigNumber;
      const poolLength = parseInt(poolLengthBN.toString());

      const mcMasterchef = new MulticallContract(
        masterchef.address,
        masterchef.interface.fragments,
      );

      let farmInfo = await multicallProvider.all(
        Array(parseInt(poolLength.toString()))
          .fill(0)
          .map((_, poolIndex) => {
            return mcMasterchef.poolInfo(poolIndex);
          }),
      );

      if (farmInfo.length && !farmInfo[0].lpToken) {
        farmInfo = await Promise.all(
          farmInfo.map(async (x, idx) => {
            const lpToken = await masterchef.lpToken(idx);
            return {
              ...x,
              lpToken,
            };
          }),
        );
      }

      // extract response and convert to something we can use
      const farms = farmInfo.map((x, idx) => {
        return {
          ...x,
          poolIndex: idx,
        };
      });

      setFarms(farms);
    }
  };

  useEffect(() => {
    getFarms();
  }, [masterchef, blockNum]);

  return { rawFarms: farms };
};
