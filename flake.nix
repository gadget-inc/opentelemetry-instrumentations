{
  description = "Gadget js-clients development environment";

  inputs = {
    flake-utils.url = "github:numtide/flake-utils";
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
  };

  outputs = { self, flake-utils, nixpkgs }:
    (flake-utils.lib.eachSystem [
      "x86_64-linux"
      "x86_64-darwin"
    ]
      (system: nixpkgs.lib.fix (flake:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in
        rec {
          packages = rec {
            nodejs = pkgs.nodejs-16_x;
            yarn = pkgs.yarn.override {
              inherit nodejs;
            };
            git = pkgs.git;
          };

          devShell = pkgs.mkShell {
            packages = builtins.attrValues self.packages.${system};
          };
        }
      )));
}
