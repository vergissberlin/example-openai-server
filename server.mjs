import express from 'express'
import {Configuration, OpenAIApi} from "openai"

import dotenv from 'dotenv'
dotenv.config()

const app = express()
const port = process.env.PORT || 3000
const url = process.env.URL || 'http://localhost'

const configuration = new Configuration({
    organization: process.env.OPENAI_ORG,
    apiKey: process.env.OPENAI_KEY,
})
const openai = new OpenAIApi(configuration)

app.get('/', async (req, res) => {
    // Add CORS headers to the response
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE')
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type')
    res.setHeader('Access-Control-Allow-Credentials', true)

    // get get parameter question from the request
    const question = req.query.question
    if (!question) {
        res.json({text: "No question provided"})
        return
    }

    const completion = await openai.createCompletion({
        model: "text-davinci-002",
        prompt: question,
        max_tokens: 1000,
        temperature: 0.5,
    })
    console.log(completion.data.choices[0].text)
    res.json({text: completion.data.choices[0].text})
})

app.listen(port, () => console.log(`OpenAI server listening on ${url}:${port}! `))
