# QR Redirects

This repository provides a simple and scalable way to manage dynamic redirects for QR codes using GitHub Pages. Each subfolder represents a unique QR redirect path that can be updated at any time by editing a single HTML file.

## 🔧 How It Works

Each redirect is a folder containing an `index.html` file with a meta-refresh tag. When a user scans the associated QR code, they’re redirected to the current target URL.

```html
<meta http-equiv="refresh" content="0;url=https://your-target-url.com">
