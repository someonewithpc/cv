{
  description = "CV website";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            git
            nodejs_22
            # vnu, the W3C Nu HTML checker `npm run test:audit:w3c` calls.
            validator-nu
          ];

          shellHook = ''
            if [ ! -d node_modules ]; then
              npm install
            fi

            export PATH="$PWD/node_modules/.bin:$PATH"
          '';
        };
      }
    );
}
