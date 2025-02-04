import dotenv from "dotenv";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { GraphAI, GraphData, DefaultResultData } from "graphai";
import * as agents from "@graphai/agents";

import { ScriptData } from "./type";

dotenv.config();
const openai = new OpenAI();

const image_agent = async (namedInputs: {
  row: { text: string; index: number };
  suffix: string;
  script: ScriptData;
  keywords: string;
  prompt: string;
}) => {
  const { row, suffix, script, keywords, prompt } = namedInputs;
  const relativePath = `./images/${script.filename}/${row.index}${suffix}.png`;
  const imagePath = path.resolve(relativePath);
  if (fs.existsSync(imagePath)) {
    console.log("cached", imagePath);
    return relativePath;
  }

  const response = await openai.images.generate({
    model: "dall-e-3",
    prompt: prompt ? `${prompt}\n${keywords}` : row.text,
    n: 1,
    size: "1024x1024", // "1792x1024",
  });

  const imageRes = await fetch(response.data[0].url!);
  const writer = fs.createWriteStream(imagePath);
  if (imageRes.body) {
    const reader = imageRes.body.getReader();
    let done = false;

    while (!done) {
      const { value, done: readerDone } = await reader.read();
      if (value) {
        writer.write(Buffer.from(value));
      }
      done = readerDone;
    }

    writer.end();
    console.log("generated", imagePath);
  } else {
    throw new Error("Response body is null or undefined");
  }

  // Return a Promise that resolves when the writable stream is finished
  await new Promise<void>((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
  return relativePath;
};

const graph_data: GraphData = {
  version: 0.5,
  concurrency: 1,
  nodes: {
    script: {
      value: {},
    },
    map: {
      agent: "mapAgent",
      inputs: { rows: ":script.imageInfo", script: ":script" },
      isResult: true,
      graph: {
        nodes: {
          keywords: {
            agent: "openAIAgent",
            inputs: {
              messages: [
                {
                  role: "system",
                  content:
                    "与えられたテキストからキーワードを抜き出して、JSONのarrayで返して",
                },
                {
                  role: "user",
                  content: ":row.text",
                },
              ],
            },
          },
          plain: {
            agent: image_agent,
            inputs: {
              row: ":row",
              script: ":script",
              keywords: ":keywords.text",
              suffix: "p",
              prompt: "以下のキーワードに適した画像を生成して。",
            },
          },
          output: {
            agent: "copyAgent",
            inputs: {
              text: ":row.text",
              index: ":row.index",
              image: ":plain",
              json: ":keywords.text",
            },
            console: {
              after: true,
            },
            isResult: true,
          },
          /*
          anime: {
            agent: image_agent,
            inputs: {
              "row": ":row",
              "script": ":script",
              "suffix": "a",
              "prompt": "以下のテキストに適した画像を、日本のアニメのイラスト風に描いて。",
            },
          },
          water: {
            agent: image_agent,
            inputs: {
              "row": ":row",
              "script": ":script",
              "suffix": "w",
              "prompt": "以下のテキストに適した画像を、水彩画風に描いて。",
            },
          }
          */
        },
      },
    },
  },
};

const main = async () => {
  const arg2 = process.argv[2];
  const scriptPath = path.resolve(arg2);
  const parsedPath = path.parse(scriptPath);

  const tmScriptPath = path.resolve("./output/" + parsedPath.name + ".json");
  const dataTm = fs.readFileSync(tmScriptPath, "utf-8");
  const jsonDataTm = JSON.parse(dataTm);

  const currentDir = process.cwd();
  const imagesFolderDir = path.join(currentDir, "images");
  if (!fs.existsSync(imagesFolderDir)) {
    fs.mkdirSync(imagesFolderDir);
  }
  const imagesDir = path.join(imagesFolderDir, jsonDataTm.filename);
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir);
  }
  const graph = new GraphAI(graph_data, {
    ...agents,
  });

  // DEBUG
  // jsonDataTm.imageInfo = [jsonDataTm.imageInfo[0]];

  graph.injectValue("script", jsonDataTm);
  const results = await graph.run();
  if (results.map) {
    const data = results.map as DefaultResultData[];
    const info = data.map((element: any) => {
      return element.output;
    });
    jsonDataTm.imageInfo = info;
    fs.writeFileSync(tmScriptPath, JSON.stringify(jsonDataTm, null, 2));
  }
};

main();
