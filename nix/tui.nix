# Self-contained Jin TUI, compiled by the same recipe as npm.
{ jinNpmLib, ... }:
jinNpmLib.buildNpmPackage {
  dirs = [
    "ui-tui"
    "apps/shared"
    "scripts/build/tui.mjs"
    "scripts/build/freshness.mjs"
    "scripts/build/frontend-common.mjs"
  ];

  doCheck = false;

  buildPhase = ''
    runHook preBuild
    node scripts/build/tui.mjs --source "$PWD" --out "$TMPDIR/tui-product"
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall
    mkdir -p $out/lib/jin-tui
    cp -r "$TMPDIR/tui-product/." $out/lib/jin-tui/
    runHook postInstall
  '';
}
