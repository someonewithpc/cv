{
  description = "nix-ld environment for prebuilt Linux binaries (e.g. Cloudflare workerd)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { nixpkgs, ... }: {
    lib.mkEnv = system: let
      pkgs = nixpkgs.legacyPackages.${system};
      nixLd = pkgs.nix-ld;
      dynamicLinker = pkgs.stdenv.cc.bintools.dynamicLinker;
      libraries = with pkgs; [
        acl
        attr
        bzip2
        curl
        libssh
        libsodium
        libxml2
        openssl
        stdenv.cc.cc
        util-linux
        xz
        zlib
        zstd
      ];
      libraryPath = pkgs.lib.makeLibraryPath libraries;
    in {
      packages = [ nixLd pkgs.patchelf ];
      env = {
        NIX_LD = dynamicLinker;
        NIX_LD_LIBRARY_PATH = libraryPath;
      };
      shellHook = ''
        patch_nix_ld_binary() {
          local binary="$1"

          if [ ! -f "$binary" ]; then
            return 0
          fi

          if ${pkgs.patchelf}/bin/patchelf --print-interpreter "$binary" 2>/dev/null \
            | grep -q '${nixLd}/bin/nix-ld'; then
            return 0
          fi

          ${pkgs.patchelf}/bin/patchelf --set-interpreter '${nixLd}/bin/nix-ld' "$binary"
        }

        patch_nix_ld_binary "$PWD/node_modules/@cloudflare/workerd-linux-64/bin/workerd"
      '';
    };
  };
}
