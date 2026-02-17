import Dialog from "../js/dialog.js";

export default function openAbout() {
    const aboutContent = `
        <p style="margin-bottom: 10px;"><strong>Spark Radar</strong> is a 100% free, open-source, advanced weather radar visualization app that runs in your browser. Because everyone experiences weather. Knowing what's coming shouldn't be a mystery.</p>
        <p>Spark Radar is on its <strong>third rewrite</strong> since development started in 2024. Every version is open source on <a href="https://github.com/tgranz/sparkradar">GitHub</a>.</p>
        <div style="display: flex; flex-direction: column; align-items: center; margin-top: 20px; width: 100%;">
            <div style="background-color: #fff5ec; color: #F6821F; font-size: 14px; padding: 4px; border-radius: 10px;">
                <p style="margin-bottom: 0px; font-weight: bold; text-align: center;">Secured by</p>
                <img src="https://cdn.brandfetch.io/idJ3Cg8ymG/theme/dark/logo.svg?c=1bxid64Mup7aczewSAYMX&amp;t=1667589504295" alt="Cloudflare" style="height: 45px; width: auto; margin-right: 0px; vertical-align: middle;">
            </div>
        </div>
    `;

    const dialog = new Dialog('About Spark Radar', 'info-circle', aboutContent);
}