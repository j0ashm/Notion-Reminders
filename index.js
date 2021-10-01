const { Client } = require("@notionhq/client")
const dayjs = require('dayjs')

var relativeTime = require('dayjs/plugin/relativeTime')
dayjs.extend(relativeTime)

require('dotenv').config()

const notion = new Client({ 
    auth: process.env.NOTION_KEY,
});

const databaseId = process.env.NOTION_DB

const taskObject = {} 

async function populateDateStore() {
    const currentTasks = await getTasksFromDb()

    for (const { pageId, dueDate, title } of currentTasks) {
        taskObject[title] = {dueDate, pageId}
    }
}

async function checkForCompletion(tasks) {
    for (const task in tasks) {
        const pageStats = await notion.pages.retrieve({page_id: tasks[task].pageId})

        if (pageStats.properties['Complete'].checkbox === true) {
            console.log('Archiving page...')
            notion.pages.update({
                page_id: tasks[task].pageId,
                archived: true
            })
            console.log(`Removing ${tasks[task]} from the active task list...`)
            delete taskObject[task]
            console.log(taskObject)
            console.log('Deletion complete.')
        }
    }

    return tasks
}

async function getTasksFromDb() {
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

    return pages.map(page => {
        const dueDateProperty = page.properties['Due'].date['start']
        const titleProp = page.properties['Name'].title[0]['plain_text']
        return {
            pageId: page.id,
            dueDate: dueDateProperty,
            title: titleProp
        }
    })
}