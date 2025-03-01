import { formatEther, parseEther } from "ethers/lib/utils";
import { useState, FC, useEffect } from "react";
import { Button, Grid, Spacer, Select, Input } from "@geist-ui/react";
import { useTranslation } from "next-i18next";

import { Connection } from "../../containers/Connection";
import { UserGaugeData, UserGauges } from "../../containers/UserGauges";
import { Dill, UseDillOutput } from "../../containers/Dill";
import Collapse from "../Collapsible/Collapse";
import { pickleWhite } from "../../util/constants";
import { PICKLE_JARS } from "../../containers/Jars/jars";
import { NETWORK_NAMES } from "../../containers/config";

export const CalcCollapsible: FC<{
  dillStats: UseDillOutput;
}> = ({ dillStats }) => {
  const { gaugeData } = UserGauges.useContainer();
  const { chainName } = Connection.useContainer();
  const [balance, setBalance] = useState("0");
  const [totalBalance, setTotalBalance] = useState("0");
  const [userChanged, setUserChanged] = useState(false);
  const [dillBalance, setDillBalance] = useState("0");
  const [boostFactor, setBoostFactor] = useState<number>(1);
  const [dillRequired, setDillRequired] = useState<number>();
  const [selectedGauge, setSelectedGauge] = useState<UserGaugeData>();
  const { t } = useTranslation("common");

  const dillSupplyNum = parseFloat(formatEther(dillStats.totalSupply || 0));
  const dillRatio = dillSupplyNum ? +dillBalance / (dillSupplyNum || 1) : 0;

  const gauges = gaugeData?.filter((x) => true);

  const handleSelect = async (depositToken: string) => {
    const selectedGauge = gauges?.find(
      (x) => x.depositTokenName === depositToken,
    );

    if (selectedGauge) {
      const isUsdc =
        selectedGauge.depositToken.address.toLowerCase() ===
        PICKLE_JARS.pyUSDC.toLowerCase();

      const balance = +formatEther(
        selectedGauge.balance.add(selectedGauge.staked),
      );
      const balanceUSD = (
        balance *
        selectedGauge.usdPerToken *
        (isUsdc ? 1e12 : 1)
      ).toFixed(2);

      setBalance(balanceUSD);
      setTotalBalance(
        (
          (selectedGauge.totalSupply * selectedGauge.usdPerToken) /
          (isUsdc ? 1e6 : 1e18)
        ).toFixed(2),
      );
      setSelectedGauge(selectedGauge);
    }
  };

  const formatAPY = (apy: number) => {
    if (apy === Number.POSITIVE_INFINITY) return "∞%";
    return apy.toFixed(2) + "%";
  };

  const calculateBoost = () => {
    const _baseBalance = +balance || 0;
    const _derived = _baseBalance * 0.4;
    const _adjusted = +totalBalance * dillRatio * 0.6;
    const boostFactor =
      Math.min(_baseBalance, _derived + _adjusted) / (_baseBalance * 0.4);
    const dillRequired =
      ((_baseBalance - _derived) * dillSupplyNum) / (+totalBalance * 0.6);
    setBoostFactor(boostFactor);
    setDillRequired(dillRequired);
  };

  const renderSelectOptions = (gauge: UserGaugeData) => (
    <Select.Option
      key={gauge.address}
      style={{ color: pickleWhite }}
      value={gauge.depositTokenName}
    >
      {gauge.depositTokenName}
    </Select.Option>
  );

  useEffect(() => {
    if (!userChanged && dillStats && dillStats.balance)
      setDillBalance(formatEther(dillStats.balance.toString() || 0));
  }, [dillStats]);

  if (!gaugeData && chainName === NETWORK_NAMES.ETH) {
    return <h2>{t("connection.loading")}</h2>;
  }
  return (
    <Collapse
      style={{ borderWidth: "1px", boxShadow: "none", flex: 1 }}
      shadow
      preview={<h2>{t("dill.boostCalculator")}</h2>}
    >
      <Spacer y={1} />
      <Grid.Container gap={2}>
        <Grid xs={24} md={12}>
          <Select
            placeholder={t("dill.selectFarm")}
            width="100%"
            onChange={(value) => handleSelect(value as string)}
          >
            {gauges?.map(renderSelectOptions)}
          </Select>
          <Spacer y={0.5} />
          <div>{t("balances.yourBalance")} ($): </div>
          <Spacer y={0.5} />
          <Input
            onChange={(e) => setBalance(e.target.value)}
            value={balance}
            width="100%"
            type="value"
            size="large"
          />
          <Spacer y={0.5} />
          <div>{t("balances.poolBalance")} ($): </div>
          <Spacer y={0.5} />
          <Input
            onChange={(e) => setTotalBalance(e.target.value)}
            value={totalBalance}
            width="100%"
            type="value"
            size="large"
          />
          <Spacer y={0.5} />
          <div>{t("dill.yourDill")}:</div>
          <Spacer y={0.5} />
          <Input
            onChange={(e) => {
              setUserChanged(true);
              setDillBalance(e.target.value);
            }}
            value={dillBalance}
            width="100%"
            type="value"
            size="large"
          />
          <Spacer />
          <Button
            disabled={false}
            onClick={calculateBoost}
            style={{ width: "100%" }}
          >
            {t("dill.calculate")}
          </Button>
        </Grid>
        <Grid xs={24} md={12}>
          <div>
            {t("dill.boostFactor")}: <strong>{boostFactor.toFixed(3)}x</strong>
          </div>
          <Spacer y={0.5} />
          <div>
            {t("dill.dillRequired")}:{" "}
            <strong>{dillRequired?.toFixed(3) || null}</strong>
          </div>
          <Spacer y={0.5} />
          <div>
            {t("dill.pickleApy")}:{" "}
            <strong>
              {selectedGauge
                ? formatAPY((selectedGauge.fullApy / 2.5) * boostFactor * 100)
                : "0.00%"}
            </strong>
          </div>
        </Grid>
      </Grid.Container>
    </Collapse>
  );
};
