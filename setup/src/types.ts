export interface SetupConfig {
  botName: string;
  aiProvider: "anthropic" | "ai-gateway";
  anthropicApiKey: string;
  aiGatewayApiKey: string;
  aiGatewayAccountId: string;
  aiGatewayGatewayId: string;
  gatewayToken: string;
  r2AccessKeyId: string;
  r2SecretKey: string;
  cfAccountId: string;
}

export const defaultConfig: SetupConfig = {
  botName: "",
  aiProvider: "anthropic",
  anthropicApiKey: "",
  aiGatewayApiKey: "",
  aiGatewayAccountId: "",
  aiGatewayGatewayId: "",
  gatewayToken: "",
  r2AccessKeyId: "",
  r2SecretKey: "",
  cfAccountId: "",
};
