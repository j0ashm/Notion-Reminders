const { Client } = require("@notionhq/client")
require('dotenv').config()

const notion = new Client({ 
    auth: process.env.NOTION_KEY,
});

const databaseId = process.env.NOTION_DB

async function getTasks() {
    const pages = []
    let cursor = undefined

    while (true) {
        const { results, nextCursor } = await notion.databases.query({
            database_id: databaseId,
            start_cursor: cursor
        })
        pages.push(...results)

        if (!nextCursor) break
    }
    console.log(`${pages.length} items were successfully fetched from database.`)

    pages.map(page => {
        const dueDateProperty = page.properties['Due'].date['start']
        const titleProp = page.properties['Name'].title[0]['plain_text']

        console.log(dueDateProperty, titleProp)
    })
}

getTasks()