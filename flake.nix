{
  description = "CV website";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    nix-ld.url = "path:./nix/nix-ld";
    nix-ld.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs = { self, nixpkgs, flake-utils, nix-ld, ... }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        nixLdEnv = nix-ld.lib.mkEnv system;
      in
      {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            git
            nodejs_22
          ] ++ nixLdEnv.packages;

          inherit (nixLdEnv.env) NIX_LD NIX_LD_LIBRARY_PATH;

          shellHook = nixLdEnv.shellHook + ''
            if [ ! -d node_modules ]; then
              npm install
            fi

            export PATH="$PWD/node_modules/.bin:$PATH"
          '';
        };
      }
    );
}
