/// <reference path="../.astro/types.d.ts" />
declare namespace App {
  interface Locals {
    me: import("./lib/types").Me | null;
    site: import("./lib/types").SiteInfo;
    api: ReturnType<typeof import("./lib/api").serverApi>;
  }
}
