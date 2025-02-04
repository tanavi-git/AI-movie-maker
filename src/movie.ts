import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import { createCanvas, loadImage } from "canvas";
import { PodcastScript } from "./type";

async function renderJapaneseTextToPNG(
  text: string,
  outputFilePath: string,
  canvasInfo: any,
) {
  const fontSize = 48;
  const paddingX = 48 * 2;
  const paddingY = 12;
  const lineHeight = fontSize + 8;

  const lines: string[] = [];
  let currentLine = "";
  let currentWidth = 0;

  // Iterate over each character and determine line breaks based on character width estimate
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const code = char.charCodeAt(0);
    const isAnsi = code < 255;
    const isCapital = code >= 0x40 && code < 0x60;
    const charWidth = isAnsi
      ? isCapital
        ? fontSize * 0.8
        : fontSize * 0.5
      : fontSize;
    const isTrailing =
      char === "。" || char === "、" || char === "？" || char === "！";

    if (char === "\n") {
      lines.push(currentLine);
      currentLine = "";
      currentWidth = 0;
    } else if (
      currentWidth + charWidth > canvasInfo.width - paddingX * 2 &&
      !isTrailing
    ) {
      lines.push(currentLine);
      currentLine = char;
      currentWidth = charWidth;
    } else {
      currentLine += char;
      currentWidth += charWidth;
    }
  }

  // Push the last line if there's any remaining text
  if (currentLine) {
    lines.push(currentLine);
  }

  const textHeight = lines.length * lineHeight + paddingY * 2;
  const textTop = canvasInfo.height - textHeight;

  // Create a canvas and a drawing context
  const canvas = createCanvas(canvasInfo.width, canvasInfo.height);
  const context = canvas.getContext("2d");

  // Set background color
  context.fillStyle = "rgba(0, 0, 0, 0.5)";
  context.fillRect(0, textTop, canvasInfo.width, textHeight);

  // Set text styles
  context.font = `bold ${fontSize}px Arial`;
  context.fillStyle = "#ffffff";
  context.textAlign = "center";
  context.textBaseline = "top";

  // Set shadow properties
  context.shadowColor = "rgba(0, 0, 0, 0.8)";
  context.shadowOffsetX = 5;
  context.shadowOffsetY = 5;
  context.shadowBlur = 10;

  lines.forEach((line: string, index: number) => {
    context.fillText(
      line,
      canvasInfo.width / 2,
      textTop + lineHeight * index + paddingY,
    );
  });

  // Save the image
  const buffer = canvas.toBuffer("image/png");
  fs.writeFileSync(outputFilePath, buffer);

  console.log(`Image saved to ${outputFilePath}`);
}

interface ImageDetails {
  path: string;
  duration: number; // Duration in seconds for each image
}

const createVideo = (
  audioPath: string,
  images: ImageDetails[],
  outputVideoPath: string,
  canvasInfo: any,
) => {
  let command = ffmpeg();

  // Add each image input
  images.forEach((image) => {
    command = command.input(image.path);
  });

  // Build filter_complex string to manage start times
  const filterComplexParts: string[] = [];

  images.forEach((image, index) => {
    // Add filter for each image
    filterComplexParts.push(
      // `[${index}:v]scale=${canvasInfo.width}:${canvasInfo.height},setsar=1,format=yuv420p,trim=duration=${image.duration},setpts=${startTime}/TB[v${index}]`,
      `[${index}:v]scale=${canvasInfo.width * 4}:${canvasInfo.height * 4},setsar=1,format=yuv420p,zoompan=z=zoom+0.0004:x=iw/2-(iw/zoom/2):y=ih-(ih/zoom):s=${canvasInfo.width}x${canvasInfo.height}:fps=30:d=${image.duration * 30},trim=duration=${image.duration}[v${index}]`,
    );
  });

  // Concatenate the trimmed images
  const concatInput = images.map((_, index) => `[v${index}]`).join("");
  filterComplexParts.push(`${concatInput}concat=n=${images.length}:v=1:a=0[v]`);

  // Apply the filter complex for concatenation and map audio input
  command
    .complexFilter(filterComplexParts)
    .input(audioPath) // Add audio input
    .outputOptions([
      "-map [v]", // Map the video stream
      "-map " + images.length + ":a", // Map the audio stream (audio is the next input after all images)
      "-c:v libx264", // Set video codec
      "-r 30", // Set frame rate
      "-pix_fmt yuv420p", // Set pixel format for better compatibility
    ])
    .on("start", (__cmdLine) => {
      console.log("Started FFmpeg ..."); // with command:', cmdLine);
    })
    .on("error", (err, stdout, stderr) => {
      console.error("Error occurred:", err);
      console.error("FFmpeg stdout:", stdout);
      console.error("FFmpeg stderr:", stderr);
    })
    .on("end", () => {
      console.log("Video created successfully!");
    })
    .output(outputVideoPath)
    .run();
};

const main = async () => {
  const arg2 = process.argv[2];
  const scriptPath = path.resolve(arg2);
  const parsedPath = path.parse(scriptPath);
  const name = parsedPath.name;
  const data = fs.readFileSync(scriptPath, "utf-8");
  const jsonData: PodcastScript = JSON.parse(data);

  const canvasInfo = {
    width: 1280, // not 1920
    height: 720, // not 1080
  };
  if (jsonData.aspectRatio === "9:16") {
    canvasInfo.width = 720;
    canvasInfo.height = 1280;
  }

  //
  await renderJapaneseTextToPNG(
    `${jsonData.title}\n\n${jsonData.description}`,
    `./scratchpad/${name}_00.png`, // Output file path
    canvasInfo,
  ).catch((err) => {
    console.error("Error generating PNG:", err);
  });

  const promises = jsonData.script.map((element: any, index: number) => {
    return renderJapaneseTextToPNG(
      element["text"],
      `./scratchpad/${name}_${index}.png`, // Output file path
      canvasInfo,
    ).catch((err) => {
      console.error("Error generating PNG:", err);
    });
  });
  await Promise.all(promises);

  const tmScriptPath = path.resolve("./output/" + name + ".json");
  const dataTm = fs.readFileSync(tmScriptPath, "utf-8");
  const jsonDataTm: PodcastScript = JSON.parse(dataTm);

  // add images
  const imageInfo = jsonDataTm.imageInfo;
  await imageInfo.forEach(async (element: { index: number; image: string }) => {
    const { index, image } = element;
    if (image) {
      const imagePath = `./scratchpad/${name}_${index}.png`;
      const imageText = await loadImage(imagePath);
      const imageBG = await loadImage(image);
      const bgWidth = imageBG.width;
      const bgHeight = imageBG.height;
      const viewWidth = (bgWidth / bgHeight) * canvasInfo.height;
      const canvas = createCanvas(canvasInfo.width, canvasInfo.height);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(
        imageBG,
        (canvasInfo.width - viewWidth) / 2,
        0,
        viewWidth,
        canvasInfo.height,
      );
      ctx.drawImage(imageText, 0, 0);
      const buffer = canvas.toBuffer("image/png");
      fs.writeFileSync(imagePath, buffer);
    }
  });

  const audioPath = path.resolve("./output/" + name + "_bgm.mp3");
  const images: ImageDetails[] = jsonDataTm.script.map(
    (item: any, index: number) => {
      const duration = item.duration;
      return {
        path: path.resolve(`./scratchpad/${name}_${index}.png`),
        duration,
      };
    },
  );
  const outputVideoPath = path.resolve("./output/" + name + "_ja.mp4");
  const titleImage: ImageDetails = {
    path: path.resolve(`./scratchpad/${name}_00.png`),
    duration: (jsonData.padding ?? 4000) / 1000,
  };
  const imagesWithTitle = [titleImage].concat(images);

  createVideo(audioPath, imagesWithTitle, outputVideoPath, canvasInfo);
};

main();
