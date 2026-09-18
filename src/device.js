import { Adb, resolveAdb } from "./adb.js";

export class DeviceError extends Error {}

// Resolves adb and picks the target device: the one passed with --device,
// or the sole connected device, or an error listing the choices.
export async function pickDevice(requestedSerial) {
  const bin = resolveAdb();
  if (!bin) {
    throw new DeviceError(
      "adb not found. Install Android platform-tools and make sure it's on your PATH, or set ANDROID_HOME."
    );
  }

  const probe = new Adb(bin);
  const devices = (await probe.devices()).filter((d) => d.state === "device");

  if (devices.length === 0) {
    throw new DeviceError("no Android devices/emulators connected (checked `adb devices`).");
  }
  if (requestedSerial) {
    if (!devices.some((d) => d.serial === requestedSerial)) {
      throw new DeviceError(
        `device "${requestedSerial}" not found. Connected: ${devices.map((d) => d.serial).join(", ")}`
      );
    }
    return new Adb(bin, requestedSerial);
  }
  if (devices.length > 1) {
    throw new DeviceError(
      `multiple devices connected (${devices.map((d) => d.serial).join(", ")}) — pass --device <serial>.`
    );
  }
  return new Adb(bin, devices[0].serial);
}

export { resolveAdb };
