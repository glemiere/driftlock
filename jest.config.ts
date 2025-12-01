import type { Config } from "jest";

const config: Config = {
  roots: ["<rootDir>/tests"],
  testMatch: ["**/*.test.ts"],
  verbose: true,
  testLocationInResults: true,
  transform: {
    "^.+\\.ts$": ["ts-jest"]
  },
  moduleFileExtensions: ["ts", "js", "json"],
  testEnvironment: "node",
  clearMocks: true
};

export default config;
