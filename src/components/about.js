import Dialog from "../js/ui/dialog.js";

export default function openAbout() {
    const aboutContent = `
        <p style="margin-bottom: 10px;"><strong>SparkRadar</strong> is a 100% free, open-source, advanced weather radar visualization app that runs in your browser. Because everyone experiences weather. Knowing what's coming shouldn't be a mystery.</p>
        <p style="margin-bottom: 10px;">SparkRadar is on its <strong>third rewrite</strong> since development started in 2024. Every version is open source on <a href="https://github.com/tgranz/sparkradar">GitHub</a>.</p>
        <p>SparkRadar focuses on ease of use, a simple yet beautiful interface, and privacy. The only tracker on this website is the anonymous, privacy-first Simple Analytics.</p>
        <div class="badge-container" style="display: flex; justify-content: space-around; flex-direction: row; align-items: center; margin-top: 20px; width: 100%;">
            <div style="background-color: #fff5ec; color: #F6821F; font-size: 14px; padding: 4px; border-radius: 10px;">
                <p style="margin-bottom: 0px; font-weight: bold; text-align: center;">Secured by</p>
                <img src="https://cdn.brandfetch.io/idJ3Cg8ymG/theme/dark/logo.svg?c=1bxid64Mup7aczewSAYMX&amp;t=1667589504295" alt="Cloudflare" style="height: 45px; width: auto; margin-right: 0px; vertical-align: middle;">
            </div>

            <a href="https://dashboard.simpleanalytics.com/sparkradar.app?utm_source=sparkradar.app&utm_content=badge&affiliate=vatip-vib" referrerpolicy="origin" target="_blank">
                <picture>
                    <img id="simpleanalytics-badge" src="https://simpleanalyticsbadges.com/sparkradar.app?mode=dark&radius=10" loading="lazy" referrerpolicy="no-referrer" crossorigin="anonymous" />
                </picture>
            </a>
        </div>
    `;

    const dialog = new Dialog('About SparkRadar', 'info-circle', aboutContent);
}