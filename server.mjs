import express from 'express'
import {Configuration, OpenAIApi} from "openai"

import dotenv from 'dotenv'
dotenv.config()

const app = express()
const port = process.env.PORT || 3000
const url = process.env.URL || 'http://localhost'
const origin = process.env.ORIGIN || '*'

const configuration = new Configuration({
    organization: process.env.OPENAI_ORG,
    apiKey: process.env.OPENAI_KEY,
})
const openai = new OpenAIApi(configuration)

/**
 * Prepare the request by adding CORS headers and checking for a prompt
 * @param res
 * @returns {Promise<void>}
 * @private
 */
const prepareRequest = (res) => {
    // Add CORS headers to the response
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST')
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type')
    res.setHeader('Access-Control-Allow-Credentials', true)
}

app.get('/text/', async (req, res) => {
    prepareRequest(res)
    // Get get parameter prompt from the request
    const prompt = req.query.prompt
    if (!prompt) {
        res.json({text: "No prompt provided"})
        return
    }
    const completion = await openai.createCompletion({
        model: "text-davinci-003",
        prompt,
        max_tokens: 1000,
        temperature: 0.5,
    }).catch((error) => {
        console.log(error)
        res.json({text: "Error"})
    })
    console.log(completion.data.choices[0].text)
    res.json({text: completion.data.choices[0].text})
})

app.get('/image/', async (req, res) => {
    prepareRequest(res)

    // Get get parameter prompt from the request
    const prompt = req.query.prompt
    if (!prompt) {
        res.json({image: "No prompt provided"})
        return
    }
    const response = await openai.createImage({
        prompt,
        n: 1,
        size: "512x512",
    }).catch((error) => {
        console.log(error)
    })

    if (response.data.data.length === 0) {
        res.json({image: "No image found"})
        return
    }
    let image_url = response.data.data[0].url
    console.log(image_url)
    res.json({image: image_url})
})

app.listen(port, () => console.log(`OpenAI server listening on ${url}:${port}! `))
