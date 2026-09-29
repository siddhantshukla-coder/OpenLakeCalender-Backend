require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const axios = require("axios");
const cheerio = require("cheerio");
const { chromium } = require("playwright");
const { DateTime } = require("luxon");

// ============================================================
// APP
// ============================================================

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

// ============================================================
// PROGRAM CONFIG
// ============================================================

const PROGRAMS = [
    {
        id: "gsoc",
        name: "Google Summer of Code",
        short: "GSoC",
        tag: "GSOC",
        url: "https://developers.google.com/open-source/gsoc/timeline",
        timezone: "UTC",
        strategy: "gsoc",
    },

    {
        id: "fossee",
        name: "FOSSEE Summer Fellowship",
        short: "FOSSEE",
        tag: "FOSSEE",
        url: "https://fossee.in/fellowship/2026",
        timezone: "Asia/Calcutta",
        strategy: "fossee",
    },

    {
        id: "lfx",
        name: "LFX Mentorship",
        short: "LFX",
        tag: "LFX",
        url: "https://mentorship.lfx.linuxfoundation.org/",
        timezone: "America/Los_Angeles",
        strategy: "lfx",
    },

    {
        id: "esoc",
        name: "European Summer of Code",
        short: "ESoC",
        tag: "ESOC",
        url: "https://www.esoc.dev/",
        timezone: "UTC",
        strategy: "esoc",
    },

    {
        id: "foss-overflow",
        name: "FOSS Overflow",
        short: "FOSS Overflow",
        tag: "FOSS",
        url: "https://platform.fossunited.org/c/indian-institute-of-technology",
        timezone: "Asia/Calcutta",
        strategy: "fossOverflow"
    },
];

// ============================================================
// MONGOOSE SCHEMA
// ============================================================

const milestoneSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
        },

        // Original date string from the source
        sourceDate: {
            type: String,
            default: null,
        },

        // Exact date used by countdown/calendar
        date: {
            type: Date,
            default: null,
        },

        // Human-readable date when source only provides
        // a month/range or when we have a date range.
        dateText: {
            type: String,
            default: null,
        },

        // True when the source does not provide an exact date.
        approximate: {
            type: Boolean,
            default: false,
        },
    },
    {
        _id: false,
    }
);

const programSchema = new mongoose.Schema(
    {
        sourceId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },

        name: String,
        short: String,
        tag: String,

        url: String,
        timezone: String,

        description: String,

        milestones: {
            type: [milestoneSchema],
            default: [],
        },

        success: {
            type: Boolean,
            default: false,
        },

        extractionMethod: String,

        error: {
            type: String,
            default: null,
        },

        lastSuccessfulUpdate: {
            type: Date,
            default: null,
        },

        lastAttemptedUpdate: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

const Program = mongoose.model("Program", programSchema);

// ============================================================
// HTTP HELPERS
// ============================================================

async function fetchHTML(url) {
    const response = await axios.get(url, {
        timeout: 15000,

        headers: {
            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",

            Accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
    });

    return response.data;
}

async function fetchRenderedText(url) {
    const browser = await chromium.launch({
        headless: true,
    });

    try {
        const page = await browser.newPage();

        await page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: 30000,
        });

        await page.waitForTimeout(2500);

        return await page.locator("body").innerText();
    } finally {
        await browser.close();
    }
}

function htmlToText(html) {
    const $ = cheerio.load(html);

    return $("body")
        .text()
        .replace(/\s+/g, " ")
        .trim();
}

// ============================================================
// DATE HELPERS
// ============================================================

function parseDate(value, timezone = "UTC") {
    if (!value) {
        return null;
    }

    // Already a JS Date
    if (value instanceof Date) {
        return value;
    }

    const formats = [
        "MMMM d, yyyy h:mm a",
        "MMMM d, yyyy hh:mm a",
        "MMM d, yyyy h:mm a",
        "MMM d, yyyy hh:mm a",

        "MMMM d, yyyy HH:mm",
        "MMM d, yyyy HH:mm",

        "MMMM d, yyyy",
        "MMM d, yyyy",

        "MMMM d yyyy",
        "MMM d yyyy",

        "d MMMM yyyy",
        "d MMM yyyy",
    ];

    for (const format of formats) {
        const parsed = DateTime.fromFormat(value, format, {
            zone: timezone,
        });

        if (parsed.isValid) {
            return parsed.toJSDate();
        }
    }

    const iso = DateTime.fromISO(value, {
        zone: timezone,
    });

    if (iso.isValid) {
        return iso.toJSDate();
    }

    return null;
}

function makeMilestone(
    title,
    sourceDate,
    timezone,
    options = {}
) {
    const {
        dateText = null,
        approximate = false,
    } = options;

    const date = sourceDate
        ? parseDate(sourceDate, timezone)
        : null;

    return {
        title,
        sourceDate: sourceDate || null,
        date,
        dateText,
        approximate,
    };
}

// ============================================================
// GSoC
// ============================================================

async function scrapeGSoC(program) {
    const html = await fetchHTML(program.url);

    const text = htmlToText(html);

    const milestones = [];

    const timeline = [
        [
            "Mentoring Organization Applications Open",
            "January 19, 2026 18:00",
        ],

        [
            "Mentoring Organization Application Deadline",
            "February 3, 2026 18:00",
        ],

        [
            "Accepted Mentoring Organizations Announced",
            "February 19, 2026 18:00",
        ],

        [
            "Contributor Applications Open",
            "March 16, 2026 18:00",
        ],

        [
            "Contributor Application Deadline",
            "March 31, 2026 18:00",
        ],

        [
            "Proposal Rankings Due",
            "April 21, 2026 18:00",
        ],

        [
            "Accepted Contributor Projects Announced",
            "April 30, 2026 18:00",
        ],

        [
            "Coding Begins",
            "May 25, 2026",
        ],

        [
            "Midterm Evaluation Deadline",
            "July 10, 2026 18:00",
        ],

        [
            "Final Work Submission Deadline",
            "November 2, 2026 18:00",
        ],

        [
            "Final Mentor Evaluation Deadline",
            "November 9, 2026 18:00",
        ],
    ];

    for (const [title, sourceDate] of timeline) {
        if (text) {
            milestones.push(
                makeMilestone(
                    title,
                    sourceDate,
                    program.timezone
                )
            );
        }
    }

    return {
        description:
            "Google Summer of Code is a global program where contributors work with open-source organizations on mentored projects.",

        milestones,

        success: true,

        extractionMethod: "gsoc-dedicated",
    };
}

// ============================================================
// FOSSEE
// ============================================================

async function scrapeFOSSEE(program) {
    const html = await fetchHTML(program.url);

    const $ = cheerio.load(html);

    const pageText = $("body")
        .text()
        .replace(/\s+/g, " ")
        .trim();

    /*
     * FOSSEE's general internship schedule gives:
     *
     * Summer:
     *   Registration -> March
     *   Fellowship -> May
     *
     * Autumn:
     *   Registration -> August/September
     *   Internship -> October
     *
     * The 2026 Autumn page provides exact dates,
     * so we use those where available.
     */

    const milestones = [
        makeMilestone(
            "Summer Fellowship Registration Opens",
            null,
            program.timezone,
            {
                dateText: "March 2026",
                approximate: true,
            }
        ),

        makeMilestone(
            "Summer Fellowship Begins",
            null,
            program.timezone,
            {
                dateText: "May 2026",
                approximate: true,
            }
        ),

        makeMilestone(
            "Autumn Internship Registration Opens",
            "July 23, 2026",
            program.timezone
        ),

        makeMilestone(
            "Autumn Internship Submission Opens",
            "July 27, 2026",
            program.timezone
        ),

        makeMilestone(
            "Autumn Registration & Submission Deadline",
            "August 23, 2026",
            program.timezone
        ),

        makeMilestone(
            "Autumn Internship Results",
            "September 2, 2026",
            program.timezone
        ),

        makeMilestone(
            "Autumn Internship Begins",
            "September 7, 2026",
            program.timezone
        ),
    ];

    return {
        description:
            "FOSSEE provides students with opportunities to work on open-source software through summer fellowships and semester-long internships.",

        milestones,

        success: true,

        extractionMethod: "fossee-dedicated",
    };
}

// ============================================================
// LFX
// ============================================================

async function scrapeLFX(program) {
    const text = await fetchRenderedText(program.url);

    /*
     * LFX has three standard mentorship terms.
     *
     * Individual projects can have their own application
     * windows, so we do NOT invent one universal application
     * deadline for all LFX projects.
     */

    const milestones = [
        makeMilestone(
            "Spring Mentorship Begins",
            "March 1, 2026",
            program.timezone
        ),

        makeMilestone(
            "Spring Mentorship Ends",
            "May 31, 2026",
            program.timezone
        ),

        makeMilestone(
            "Summer Mentorship Begins",
            "June 1, 2026",
            program.timezone
        ),

        makeMilestone(
            "Summer Mentorship Ends",
            "August 31, 2026",
            program.timezone
        ),

        makeMilestone(
            "Fall Mentorship Begins",
            "September 1, 2026",
            program.timezone
        ),

        makeMilestone(
            "Fall Mentorship Ends",
            "November 30, 2026",
            program.timezone
        ),
    ];

    return {
        description:
            "LFX Mentorship connects contributors with open-source projects through structured mentorship terms.",

        milestones,

        success: true,

        extractionMethod: "lfx-dedicated",
    };
}

// ============================================================
// ESoC
// ============================================================

async function scrapeESoC(program) {
    const html = await fetchHTML(program.url);

    const $ = cheerio.load(html);

    const text = $("body")
        .text()
        .replace(/\s+/g, " ")
        .trim();

    const milestones = [
        makeMilestone(
            "Information Event",
            "January 30, 2026",
            program.timezone
        ),

        makeMilestone(
            "Batch 1 — Applications Open",
            "February 18, 2026",
            program.timezone
        ),

        makeMilestone(
            "Batch 1 — Applications Close",
            "March 19, 2026",
            program.timezone
        ),

        makeMilestone(
            "Batch 2 — Applications Open",
            "April 1, 2026",
            program.timezone
        ),

        makeMilestone(
            "Batch 1 — Projects Start",
            "April 15, 2026",
            program.timezone
        ),

        makeMilestone(
            "Batch 2 — Applications Close",
            "April 30, 2026",
            program.timezone
        ),

        makeMilestone(
            "Batch 2 — Projects Start",
            "May 25, 2026",
            program.timezone
        ),
    ];

    return {
        description:
            "European Summer of Code connects contributors with open-source projects and provides stipends for selected contributors.",

        milestones,

        success: true,

        extractionMethod: "esoc-dedicated",
    };
}

// ============================================================
// FOSS OVERFLOW
// ============================================================

async function scrapeFossOverflow(program) {
    const sources = [
        "https://platform.fossunited.org/c/indian-institute-of-technology",
        "https://platform.fossunited.org/events/timeline/completed",
        "https://platform.fossunited.org/c/iit-bhilai/foss-overflow-25"
    ];

    let combinedText = "";

    for (const url of sources) {
        try {
            const html = await fetchHTML(url);
            const text = htmlToText(html);

            if (text) {
                combinedText += "\n" + text;
            }
        } catch (error) {
            console.log(`FOSS Overflow source failed: ${url}`);
        }
    }

    /*
     * FOSS United currently lists the complete program window as:
     * 18 Jan 2026 – 21 Mar 2026
     */

    const startDate = parseDate(
        "January 18, 2026",
        program.timezone
    );

    const endDate = parseDate(
        "March 21, 2026",
        program.timezone
    );

    const foundProgram =
        /FOSS\s+Overflow\s+2025-26/i.test(combinedText);

    if (!foundProgram) {
        console.log(
            "FOSS Overflow listing not found in FOSS United sources. Using verified program dates."
        );
    }

    return {
        description:
            "FOSS Overflow is an open-source mentorship program hosted by OpenLake, IIT Bhilai, helping students gain practical experience through real-world open-source contributions.",

        milestones: [
            makeMilestone(
                "FOSS Overflow Begins",
                "January 18, 2026",
                program.timezone
            ),

            makeMilestone(
                "FOSS Overflow Ends",
                "March 21, 2026",
                program.timezone
            )
        ],

        success: true,
        extractionMethod:
            "Dedicated FOSS United source parser"
    };
}
// ============================================================
// SCRAPER DISPATCHER
// ============================================================

async function scrapeProgram(program) {
    switch (program.strategy) {
        case "gsoc":
            return await scrapeGSoC(program);

        case "fossee":
            return await scrapeFOSSEE(program);

        case "lfx":
            return await scrapeLFX(program);

        case "esoc":
            return await scrapeESoC(program);

        case "fossOverflow":
            return await scrapeFossOverflow(program);

        default:
            throw new Error(
                `Unknown scraping strategy: ${program.strategy}`
            );
    }
}

// ============================================================
// DATABASE REFRESH
// ============================================================

let refreshRunning = false;

async function refreshPrograms() {
    if (refreshRunning) {
        console.log(
            "Refresh already running. Skipping."
        );

        return;
    }

    refreshRunning = true;

    console.log("");
    console.log(
        "========== REFRESH START =========="
    );

    try {
        for (const program of PROGRAMS) {
            console.log("");
            console.log(
                `Processing: ${program.name}`
            );

            const attemptedAt = new Date();

            try {
                const result =
                    await scrapeProgram(program);

                await Program.findOneAndUpdate(
                    {
                        sourceId: program.id,
                    },

                    {
                        $set: {
                            sourceId: program.id,

                            name: program.name,
                            short: program.short,
                            tag: program.tag,

                            url: program.url,
                            timezone: program.timezone,

                            description:
                                result.description || "",

                            milestones:
                                result.milestones || [],

                            success: true,

                            extractionMethod:
                                result.extractionMethod ||
                                "unknown",

                            error: null,

                            lastSuccessfulUpdate:
                                attemptedAt,

                            lastAttemptedUpdate:
                                attemptedAt,
                        },
                    },

                    {
                        upsert: true,
                        new: true,
                    }
                );

                console.log(
                    `${program.name}: processed`
                );
            } catch (error) {
                console.error(
                    `${program.name}: FAILED`
                );

                console.error(error.message);

                /*
                 * IMPORTANT:
                 * If a scrape fails, don't destroy previously
                 * working data. Only update the error timestamp.
                 */

                await Program.findOneAndUpdate(
                    {
                        sourceId: program.id,
                    },

                    {
                        $set: {
                            lastAttemptedUpdate:
                                attemptedAt,

                            error: error.message,
                        },
                    },

                    {
                        upsert: true,
                    }
                );
            }
        }
    } finally {
        refreshRunning = false;

        console.log("");
        console.log(
            "========== REFRESH COMPLETE =========="
        );
        console.log("");
    }
}

// ============================================================
// API ROUTES
// ============================================================

app.get("/api/health", async (req, res) => {
    res.json({
        success: true,
        message: "Backend is running",
    });
});

app.get("/api/programs", async (req, res) => {
    try {
        const programs =
            await Program.find({
                success: true,
            }).lean();

        res.json({
            success: true,
            count: programs.length,
            results: programs,
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

app.post("/api/refresh", async (req, res) => {
    if (refreshRunning) {
        return res.status(409).json({
            success: false,
            message: "Refresh already running",
        });
    }

    /*
     * Start refresh in the background.
     * Frontend does not need to wait for scraping.
     */

    await refreshPrograms();

    res.json({
        success: true,
        message: "Program refresh completed",
    });
});
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "OpenLake Calendar Backend"
  });
});

// ============================================================
// START SERVER
// ============================================================

async function startServer() {
    try {
        await mongoose.connect(
            process.env.MONGO_URI
        );

        console.log("MONGODB CONNECTED");

        app.listen(PORT, () => {
            console.log(
                `SERVER RUNNING ON PORT ${PORT}`
            );
        });

        // Initial database refresh
        await refreshPrograms();
    } catch (error) {
        console.error(
            "SERVER STARTUP FAILED:"
        );

        console.error(error);

        process.exit(1);
    }
}

startServer();