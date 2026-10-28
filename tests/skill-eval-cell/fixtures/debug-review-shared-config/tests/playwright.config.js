module.exports = {
  use: {
    launchOptions: {
      args: ["--disable-features=WebRtcHideLocalIpsWithMdns"],
    },
  },
  projects: [{ name: "chromium" }, { name: "webkit" }],
}
