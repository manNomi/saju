"use client";

import { useEffect, useMemo, useState } from "react";
import { UnleashClient, type IVariant } from "unleash-proxy-client";

export type PricingVariant = "paid_only" | "free_plus_paid";

type PricingExperimentState = {
  variant: PricingVariant;
  experimentId: string;
  source: "unleash" | "fallback";
  ready: boolean;
};

const EXPERIMENT_ID_KEY = "saju_pricing_experiment_id_v1";
const TOGGLE_NAME = "pricing_experiment_v1";

let unleashClient: UnleashClient | null = null;
let unleashStarted = false;

function hashString(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return Math.abs(hash >>> 0);
}

function fallbackVariantById(experimentId: string): PricingVariant {
  return hashString(experimentId) % 2 === 0 ? "paid_only" : "free_plus_paid";
}

function readOrCreateExperimentId() {
  if (typeof window === "undefined") {
    return "server-fallback";
  }

  const saved = window.localStorage.getItem(EXPERIMENT_ID_KEY);
  if (saved) return saved;

  const generated = `exp_${Math.random().toString(36).slice(2, 12)}`;
  window.localStorage.setItem(EXPERIMENT_ID_KEY, generated);
  return generated;
}

function toPricingVariant(variant: IVariant | null | undefined, fallback: PricingVariant): PricingVariant {
  if (!variant || !variant.enabled) return fallback;
  if (variant.name === "paid_only") return "paid_only";
  if (variant.name === "free_plus_paid") return "free_plus_paid";
  return fallback;
}

function getUnleashConfig() {
  const url = process.env.NEXT_PUBLIC_UNLEASH_PROXY_URL;
  const clientKey = process.env.NEXT_PUBLIC_UNLEASH_CLIENT_KEY;
  const appName = process.env.NEXT_PUBLIC_UNLEASH_APP_NAME ?? "saju-web";
  const environment = process.env.NEXT_PUBLIC_UNLEASH_ENVIRONMENT ?? "production";

  if (!url || !clientKey) {
    return null;
  }

  return { url, clientKey, appName, environment };
}

function ensureUnleashClient(experimentId: string) {
  const config = getUnleashConfig();
  if (!config) return null;

  if (!unleashClient) {
    unleashClient = new UnleashClient({
      url: config.url,
      clientKey: config.clientKey,
      appName: config.appName,
      environment: config.environment,
      refreshInterval: 15,
      metricsInterval: 30,
      context: {
        userId: experimentId,
      },
    });
  }

  if (!unleashStarted) {
    void unleashClient.start();
    unleashStarted = true;
  } else {
    void unleashClient.updateContext({ userId: experimentId });
  }

  return unleashClient;
}

export function usePricingExperiment(): PricingExperimentState {
  const [state, setState] = useState<PricingExperimentState>(() => {
    const experimentId = readOrCreateExperimentId();
    const fallback = fallbackVariantById(experimentId);

    return {
      variant: fallback,
      experimentId,
      source: "fallback",
      ready: true,
    };
  });

  useEffect(() => {
    const experimentId = state.experimentId;
    const fallback = fallbackVariantById(experimentId);

    const client = ensureUnleashClient(experimentId);
    if (!client) return;

    const applyVariant = () => {
      const next = toPricingVariant(client.getVariant(TOGGLE_NAME), fallback);
      setState({
        variant: next,
        experimentId,
        source: "unleash",
        ready: client.isReady(),
      });
    };

    client.on("ready", applyVariant);
    client.on("update", applyVariant);

    const timer = window.setTimeout(() => {
      applyVariant();
    }, 0);

    return () => {
      window.clearTimeout(timer);
      client.off("ready", applyVariant);
      client.off("update", applyVariant);
    };
  }, [state.experimentId]);

  return useMemo(() => state, [state]);
}
