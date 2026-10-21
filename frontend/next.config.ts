import { withAui } from "@assistant-ui/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["jay-fit-safely.ngrok-free.app"],
};

export default withAui(nextConfig);
