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

            # workerd (astro dev SSR) looks for CA roots at /etc/ssl/cert.pem, which NixOS
            # does not provide, so every outbound https fetch fails without this
            export SSL_CERT_FILE="${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt"
          '';
        };
      }
    );
}
