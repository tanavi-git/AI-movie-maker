import fs from "fs";
import dotenv from "dotenv";
dotenv.config();
// import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleAuth } from "google-auth-library";

// https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/imagen-api
const GOOGLE_PROJECT_ID = process.env.GOOGLE_PROJECT_ID; // Your Google Cloud Project ID
// const GOOGLE_IMAGEN_MODEL = "imagen-3.0-generate-001";
const GOOGLE_IMAGEN_FAST_MODEL = "imagen-3.0-fast-generate-001";
const GOOGLE_IMAGEN_ENDPOINT = `https://us-central1-aiplatform.googleapis.com/v1/projects/${GOOGLE_PROJECT_ID}/locations/us-central1/publishers/google/models/${GOOGLE_IMAGEN_FAST_MODEL}:predict`;

console.log("Project ID", GOOGLE_PROJECT_ID);
// Function to generate an image from a text prompt
async function generateImage(token: string, prompt: string): Promise<Buffer> {
  try {
    // Prepare the payload for the API request
    const payload = {
      instances: [
        {
          prompt: prompt,
        },
      ],
      parameters: {
        sampleCount: 1,
        aspectRatio: "16:9",
      },
    };

    // Make the API call using fetch
    const response = await fetch(GOOGLE_IMAGEN_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Error: ${response.status} - ${response.statusText}`);
    }

    const responseData: any = await response.json();

    // Parse and return the generated image URL or data
    const predictions = responseData.predictions;
    if (predictions && predictions.length > 0) {
      const base64Image = predictions[0].bytesBase64Encoded;
      if (base64Image) {
        return Buffer.from(base64Image, "base64"); // Decode the base64 image to a buffer
      } else {
        throw new Error("No base64-encoded image data returned from the API.");
      }
    } else {
      throw new Error("No predictions returned from the API.");
    }
  } catch (error) {
    console.error("Error generating image:", error);
    throw error;
  }
}

// Example usage
const main = async () => {
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();

  const prompt =
    "Aerial view of massive solar panel array in Kubuqi desert, stretching to horizon, cinematic lighting, sense of scale";

  try {
    const imageBuffer = await generateImage(accessToken.token!, prompt);
    fs.writeFileSync("./output/generated_image.png", imageBuffer);
    console.log("generated");
  } catch (error) {
    console.error("Failed to generate image:", error);
  }
};

main();
