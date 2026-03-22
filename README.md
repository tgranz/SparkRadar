# SparkRadar

<img style="height: 100px; border-radius: 20px;" src="https://lite.sparkradar.app/assets/logo-rounded.webp">

<br>

*Please note there is no license.*

This code is open source but **not available for redistributing**. See more in the DISCLAIMER.md file.

SparkRadar is the free online, reliable, community-supported, multiplatform, easy-to-use weather radar for beginners and pros. Also try the Lite version at [lite.sparkradar.app](https://lite.sparkradar.app)

<p style="margin-left: 20px; font-weight: bolder; font-size: 2em;"><a href="https://sparkradar.app">> https://sparkradar.app</a></p>

<br><br>

## Screenshots (as of March 2026)
<img height="350px" src="https://raw.githubusercontent.com/tgranz/SparkRadar/refs/heads/main/assets/screenshots/storminitiation.png">
<img height="300px" src="https://raw.githubusercontent.com/tgranz/SparkRadar/refs/heads/main/assets/screenshots/torr.png">
<img height="300px" src="https://raw.githubusercontent.com/tgranz/SparkRadar/refs/heads/main/assets/screenshots/torc.png">

## Features
- Access to L3 products such as **Reflectivity**, **Velocity**, **Correlation Coefficient**, **Differential Reflectivity**, **Hydrometer Classification**, and more at all available tilt levels.
- Access to archive L2 products including **Reflectivity**, **Velocity**, and **Correlation Coefficient** for any station at anytime for years back.
- Multiple advanced tools including a **radar inspector**, **drawing tool**, **measurement tool**, and more.
- Literally *instant* alerts from the National Weather Service. In my testing, SparkRadar was consistently the first radar to recieve any given alert over RadarScope, WeatherWise, and SupercellWX thanks to [SparkAlerts](https://github.com/tgranz/SparkAlerts).
- Simplest, most easy to use yet visually appealing radar application to date.
- 100% Free forever with no ads or intrusive trackers.


<br>
***
<br>

## Source Code Contents
1. [Bug Reporting](https://github.com/tgranz/SparkRadar?tab=readme-ov-file#bug-reporting)
2. [Feature Request](https://github.com/tgranz/SparkRadar?tab=readme-ov-file#requesting-a-feature)
3. [How to Contribute](https://github.com/tgranz/SparkRadar?tab=readme-ov-file#contributing)
4. [Run SparkRadar Yourself](https://github.com/tgranz/SparkRadar?tab=readme-ov-file#test)
5. [Building SparkRadar](https://github.com/tgranz/SparkRadar?tab=readme-ov-file#build)


<br>

## Bug reporting
- Open an issue ("Issues" at the top > "New Issue").
- Describe the issue you are facing. Explain how to reproduce the error.
- Include **your operating system**, **operating system version**, **browser**, and **date when the issue was discovered**.
- If needed, include screenshots or screen recordings.
- Click "Labels" > **"bug"** to label your issue as a bug.
- When you are done, click "Create" and I will check out the issue.

## Requesting a Feature
- Open an issue ("Issues" at the top > "New Issue").
- Describe the feature you would like to see added in SparkRadar.
- Click "Labels" > **"enhancement"** to label your issue as a feature request.
- When you are done, click "Create" and I will check out the request.

## Contributing
- I will review all pull requests and approve them if they fix an issue or add a feature.

## Test
1) Run `npm install`.
2) Run `npm run dev`. Code will hot-reload without browser refreshing thanks to Vite. Use `npm run host` to make the development server accessible on your network.

## Build
1) Run `npm run build`. Builds will appear in a /dist folder.
2) In the dist folder, run `python3 -m http.server 8000` then navigate to `localhost:8000` in a browser to view the build.