// @include './lib/json2.js'

import { ns } from "../shared/shared";

import * as aeft from "./aeft/aeft";

//@ts-ignore
const host = typeof $ !== "undefined" ? $ : window;

// A safe way to get the app name since some versions of Adobe Apps broken BridgeTalk in various places (e.g. After Effects 24-25)
// in that case we have to do various checks per app to deterimine the app name

const getAppNameSafely = (): ApplicationName | "unknown" => {
  const compare = (a: string, b: string) => {
    return a.toLowerCase().indexOf(b.toLowerCase()) > -1;
  };
  const exists = (a: any) => typeof a !== "undefined";
  const isBridgeTalkWorking =
    typeof BridgeTalk !== "undefined" &&
    typeof BridgeTalk.appName !== "undefined";

  // IMPORTANT: normalize BridgeTalk.appName through the same compare() helper
  // (case/format-insensitive) instead of an exact match — on some AE versions
  // the value differs in case/spacing from the expected "aftereffects", so an
  // exact match never succeeded (host[ns] was never assigned for the whole
  // session, regardless of reinstalling — a logic bug, not a corrupted file).
  // Also try app.appName as a fallback even if BridgeTalk "works" but returned
  // an unrecognized value — previously this was never attempted.
  if (isBridgeTalkWorking) {
    const btName = BridgeTalk.appName;
    if (compare(btName, "aftereffectsbeta")) return "aftereffectsbeta";
    if (compare(btName, "aftereffects") || compare(btName, "after effects")) return "aftereffects";
  }
  if (app) {
    //@ts-ignore
    if (exists(app.appName)) {
      //@ts-ignore
      const appName: string = app.appName;
      if (compare(appName, "after effects")) return "aftereffects";
    }
  }
  return "unknown";
};

switch (getAppNameSafely()) {
  case "aftereffects":
  case "aftereffectsbeta":
    host[ns] = aeft;
    break;
}

const empty = {};
export type Scripts = typeof empty & typeof aeft;

// https://extendscript.docsforadobe.dev/interapplication-communication/bridgetalk-class.html?highlight=bridgetalk#appname
type ApplicationName = "aftereffects" | "aftereffectsbeta";
