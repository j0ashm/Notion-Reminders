const { Client } = require("@notionhq/client")
const dayjs = require('dayjs')
const cron = require('node-cron')

var relativeTime = require('dayjs/plugin/relativeTime')
dayjs.extend(relativeTime)

require('dotenv').config()

const notion = new Client({ 
    auth: process.env.NOTION_KEY,
});

const sgMail = require('@sendgrid/mail')
sgMail.setApiKey(process.env.SENDGRID_API_KEY)
const { email } = require('./config.json')

const databaseId = process.env.NOTION_DB

const taskObject = {}

async function populateDataStore() {
    const currentTasks = await getTasksFromDb()

    for (const { pageId, dueDate, title } of currentTasks) {
        taskObject[title] = {dueDate, pageId}
    }
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

function filterByDate(tasks, daysFromNow) {
    const dueItems = {}

    for (const task in tasks) {
        const dueDate = tasks[task].dueDate
        const pageId = tasks[task].pageId
        const dateNow = dayjs().format('YYYY-MM-DD')
        const daysTo = Number(dayjs(dateNow).to(dueDate, true).substring(0, 2))

        if (daysTo <= daysFromNow) {
            console.log(`Found task due: ${task}`)
            dueItems[task] = { dueDate, pageId }
        }
        
    }
    return dueItems
}

function emptyObject() {
    for (const item in taskObject) {
        delete taskObject[item]
    }
    console.log('Object emptied')
}

function sendEmailsForDueItems(dueItemList) {
    for (const dueItem in dueItemList) {
        const dueDate = dueItemList[dueItem].dueDate
        const dateNow = dayjs().format('YYYY-MM-DD')
        const daysTo = Number(dayjs(dateNow).to(dueDate, true).substring(0, 2))

        if (daysTo <= 3 && daysTo >= 1) {
            const data = {
                from: `notion-reminders@${process.env.DOMAIN}`,
                to: email,
                subject: `Reminder: ${dueItem} is due soon!`,
                text: `Hey!\n\nReminder: ${dueItem} is due in ${daysTo} day(s). Make sure to complete and turn it in.\nIgnore this email if already submitted, and don't forget to mark the task as completed on Notion!`
            };
            sgMail.send(data)
            .then(() => {
                console.log(`Email sent: ${dueItem}`)
            })
            .catch((err) => {
                console.error(err);
            })
        }
        if (daysTo == 1) {
            const data = {
                from: `notion-reminders@${process.env.DOMAIN}`,
                to: email,
                subject: `URGENT: ${dueItem} is due soon!`,
                text: `URGENT!\n\n${dueItem} is due in ${daysTo} day. Make sure to complete and turn it in.\nIgnore this email if already submitted, and don't forget to mark the task as completed on Notion!`
            };
            sgMail.send(data)
            .then(() => {
                console.log(`Email sent: ${dueItem}`)
            })
            .catch((err) => {
                console.error(err);
            })
        }
    }
}

function sendWeeklyOverviewEmail(dueItemList) {
    let weekTasks = ''
    for (const dueItem in dueItemList) {
        const dueDate = dueItemList[dueItem].dueDate
        const dateNow = dayjs().format('YYYY-MM-DD')
        const daysTo = Number(dayjs(dateNow).to(dueDate, true).substring(0, 2))
        
        if (daysTo <= 7) {
            weekTasks += `${dueItem} - Due in ${daysTo} day(s)\n`
        }
    }

    if (weekTasks != '') {
        const data = {
            from: `notion-reminders@${process.env.DOMAIN}`,
            to: email,
            subject: 'Your Week Ahead',
            text: `Hi there!\nHope you had a great weekend. Here's an overview of your week ahead so that you can plan and prepare accordingly!\n\n${weekTasks}\n\nCheers!`
        };
        sgMail.send(data)
        .then(() => {
            console.log('Weekly report email sent')
        })
        .catch((err) => {
            console.error(err)
        })
    }
} 

async function main() {
    await populateDataStore()
    cron.schedule('0 * * * *', async () => {
        await checkForCompletion(taskObject)
    }, {
        timezone: 'Asia/Kolkata'
    })

    cron.schedule('1 6 * * *', async () => {
        const dueItems = filterByDate(taskObject, 3)
        sendEmailsForDueItems(dueItems)
    }, {
        timezone: 'Asia/Kolkata'
    })

    cron.schedule('1 0 * * *', async () => {
        emptyObject()
        setTimeout(async() => {
            await populateDataStore()
        }, 3000)
    }, {
        timezone: 'Asia/Kolkata'
    })

    cron.schedule('1 4 * * TUE', async () => {
        const dueItems = filterByDate(taskObject, 7)
        sendWeeklyOverviewEmail(dueItems)
    }, {
        timezone: 'Asia/Kolkata'
    })
}

main()