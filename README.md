# Troubleshooting SSL Protocol Errors

If you encounter `net::ERR_SSL_PROTOCOL_ERROR` or `TypeError: Failed to fetch` when calling the API from Blazor WebAssembly:

- Ensure the API endpoint is accessible via HTTPS.
- Verify the SSL certificate is valid and trusted by your browser.
- Check that the API base URL in your client code matches the server's HTTPS address (e.g., `https://localhost:5001/api/games`).
- For development, make sure your launch profile includes HTTPS (see `Properties/launchSettings.json`).

# Optimizing Resource Loading

To reduce published application size, install the wasm-tools workload and enable tree shaking. See [https://aka.ms/dotnet-wasm-features](https://aka.ms/dotnet-wasm-features).
