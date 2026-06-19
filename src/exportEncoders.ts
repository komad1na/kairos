import type { GpuAdapter } from "./api";
import type { ExportEncoder } from "./exportSettings";

type TFunction = (key: string, options?: Record<string, unknown>) => string;

export function availableExportEncoderOptions(
  t: TFunction,
  adapters: GpuAdapter[] | null,
): Array<{ value: ExportEncoder; label: string }> {
  const options: Array<{ value: ExportEncoder; label: string }> = [
    { value: "x264", label: t("export.encoderX264") },
  ];

  if (hasGpuVendor(adapters, "nvidia")) {
    options.push({ value: "h264Nvenc", label: t("export.encoderNvenc") });
  }
  if (hasGpuVendor(adapters, "amd") || hasGpuVendor(adapters, "radeon")) {
    options.push({ value: "h264Amf", label: t("export.encoderAmf") });
  }

  return options;
}

export function isExportEncoderAvailable(
  encoder: ExportEncoder,
  adapters: GpuAdapter[] | null,
): boolean {
  if (encoder === "x264") return true;
  if (!adapters) return true;
  if (encoder === "h264Nvenc") return hasGpuVendor(adapters, "nvidia");
  if (encoder === "h264Amf") return hasGpuVendor(adapters, "amd") || hasGpuVendor(adapters, "radeon");
  return false;
}

function hasGpuVendor(adapters: GpuAdapter[] | null, vendor: string): boolean {
  if (!adapters) return false;
  const needle = vendor.toLowerCase();
  return adapters.some((adapter) =>
    `${adapter.vendor} ${adapter.name}`.toLowerCase().includes(needle),
  );
}
