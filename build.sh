#!/bin/bash
# Exit on error
set -e

# Disable ICU dependency for the .NET CLI run inside the build container
export DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1

# Download the .NET SDK installation script
curl -sSL https://dot.net/v1/dotnet-install.sh > dotnet-install.sh
chmod +x dotnet-install.sh

# Install .NET SDK 10.0 locally
./dotnet-install.sh -c 10.0 -InstallDir ./dotnet

# Ensure the dotnet binary is executable (Cloudflare CI strips execute bits)
chmod +x ./dotnet/dotnet

# Clean old output and local build artifacts to force a complete recompilation
rm -rf output
rm -rf frontend/Heckler.Frontend/bin
rm -rf frontend/Heckler.Frontend/obj

# Publish the application using the local SDK installation without runtime relinking (emcc/wasm-tools)
./dotnet/dotnet publish frontend/Heckler.Frontend/Heckler.Frontend.csproj -c Release -o output -p:UsingBrowserRuntimeWorkload=false
