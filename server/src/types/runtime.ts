/** Render sets RENDER=true; also treat explicit NODE_ENV=production as hosted. */
export const isProdRuntime =
  process.env.NODE_ENV === "production" || process.env.RENDER === "true";
