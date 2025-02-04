import puppeteer, { Page } from 'puppeteer';
import fs from 'fs';
import path from 'path';

async function recordWebsite(url: string, duration: number = 10000, outputDir: string = './frames') {
    const browser = await puppeteer.launch({ headless: false });
    const page: Page = await browser.newPage();

    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(url);

    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // Start recording using Chrome DevTools Protocol
    const client = await page.target().createCDPSession();
    await client.send('Page.startScreencast', {
        format: 'png',
        everyNthFrame: 1 // Adjust for performance
    });

    const frames: Buffer[] = [];
    let frameIndex = 0;

    client.on('Page.screencastFrame', async (frame) => {
        const frameBuffer = Buffer.from(frame.data, 'base64');
        const framePath = path.join(outputDir, `frame-${frameIndex}.png`);
        fs.writeFileSync(framePath, frameBuffer);
        frames.push(frameBuffer);
        frameIndex++;

        await client.send('Page.screencastFrameAck', { sessionId: frame.sessionId });
    });

    // Record for the specified duration
    await new Promise(resolve => setTimeout(resolve, duration));
    await client.send('Page.stopScreencast');

    await browser.close();
    console.log(`Frames saved to ${outputDir}. Now convert them to a video using ffmpeg.`);
}

// Example usage:
const websiteUrl = 'https://www.youtube.com/watch?v=feSVtC1BSeQ';
const recordingDuration = 10000; // 1 seconds
const outputFolder = './frames';

recordWebsite(websiteUrl, recordingDuration, outputFolder)
    .then(() => console.log('Recording completed'))
    .catch(error => console.error('Error:', error));
