// A dark, calm look for an app used late in the evening: night-blue surfaces, a soft amber accent
// (a lantern), nothing bright.
import { createTheme, type MantineColorsTuple } from "@mantine/core";

const night: MantineColorsTuple = ["#d5dae6", "#b3bbcd", "#8d97b0", "#6b7693", "#4b5673", "#333c57", "#262d44", "#1c2235", "#151a2a", "#0f1320"];
const lantern: MantineColorsTuple = ["#fff6e1", "#fbeacb", "#f4d49b", "#edbc67", "#e8a83b", "#e59b1f", "#e4950f", "#ca8002", "#b47100", "#9c6000"];

export const theme = createTheme({
  primaryColor: "lantern",
  primaryShade: { dark: 4 },
  colors: { dark: night, lantern },
  fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  fontFamilyMonospace: "ui-monospace, 'SF Mono', Menlo, monospace",
  defaultRadius: "md",
  autoContrast: true,
  headings: { fontWeight: "600" },
});
