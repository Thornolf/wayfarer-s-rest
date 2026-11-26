#!/usr/bin/env bash
# Installs a GitHub Actions self-hosted runner for this repo on the Pi, as a
# systemd service, next to the existing ones (~/actions-runner-*).
# Run it yourself on the Pi: it needs your gh login and sudo.
set -euo pipefail

REPO="Thornolf/wayfarer-s-rest"
DIR="$HOME/actions-runner-wayfarer"
NAME="pi-wayfarer"

VERSION="$(gh api repos/actions/runner/releases/latest -q .tag_name | sed 's/^v//')"
mkdir -p "$DIR"
cd "$DIR"
curl -fsSL -o runner.tgz \
  "https://github.com/actions/runner/releases/download/v${VERSION}/actions-runner-linux-arm64-${VERSION}.tar.gz"
tar xzf runner.tgz
rm runner.tgz

TOKEN="$(gh api -X POST "repos/${REPO}/actions/runners/registration-token" -q .token)"
./config.sh --unattended --url "https://github.com/${REPO}" --token "$TOKEN" \
  --name "$NAME" --labels "$NAME" --work _work --replace

sudo ./svc.sh install "$USER"
sudo ./svc.sh start
gh api "repos/${REPO}/actions/runners" -q '.runners[] | .name + " " + .status'
