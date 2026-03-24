const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/app/page.tsx');
let content = fs.readFileSync(filePath, 'utf-8');

const markers = [
    { name: "shared", startStr: "import React,", endStr: "// ─── Types" },
    { name: "types", startStr: "// ─── Types", endStr: "// ─── Home / Landing Page" },
    { name: "HomePage", startStr: "// ─── Home / Landing Page", endStr: "// ─── Setup Page" },
    { name: "SetupPage", startStr: "// ─── Setup Page", endStr: "// ─── Resign Modal" },
    { name: "ResignModal", startStr: "// ─── Resign Modal", endStr: "// ─── Resigned Result Modal" },
    { name: "ResultModal", startStr: "// ─── Resigned Result Modal", endStr: "// ─── Game Over Modal" },
    { name: "GameOverModal", startStr: "// ─── Game Over Modal", endStr: "// ─── Game Page" },
    { name: "GamePage", startStr: "// ─── Game Page", endStr: "// ─── Review Page" },
    { name: "ReviewPage", startStr: "// ─── Review Page", endStr: "// ─── Lobby Page" },
    { name: "LobbyPage", startStr: "// ─── Lobby Page", endStr: "// ─── Root App" },
    { name: "App", startStr: "// ─── Root App", endStr: null }
];

let chunks = {};

markers.forEach(m => {
    let startMatch = content.indexOf(m.startStr);
    let endMatch = m.endStr ? content.indexOf(m.endStr) : content.length;
    if (startMatch !== -1 && endMatch !== -1) {
        chunks[m.name] = content.slice(startMatch, endMatch).trim();
    } else {
        console.error("Missing marker", m.name, startMatch, endMatch);
    }
});

const importsHeader = `\"use client\";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { motion, AnimatePresence } from "framer-motion";
import {
  Cpu, RefreshCw, TrendingUp, Flag, RotateCcw, Lightbulb, ChevronRight, Eye, EyeOff, Play, Clock, Zap, Brain, Shield, GitBranch, Database, Trophy, ChevronLeft, X, Crown, Activity, Target, BarChart2, BookOpen, Users, Share2, Copy, Check, Hash, MessageSquare, PlayCircle
} from "lucide-react";
import { GameSettings, MatchSettings, Stats, PlayerColor, GameMode, AppPage } from "../types";

const API_URL = process.env.NEXT_PUBLIC_ENGINE_API_URL || "http://localhost:7860";
`;

function exportComponent(chunkStr, compName) {
    if (chunkStr.startsWith("//")) {
        let lines = chunkStr.split('\n');
        lines.shift(); // remove // --- Name --- 
        chunkStr = lines.join('\n').trim();
    }
    const regex = new RegExp("function " + compName + "\\b");
    return chunkStr.replace(regex, "export function " + compName);
}

// 1. Types
fs.writeFileSync(path.join(__dirname, 'src/app/types.ts'), chunks.types + '\n\nexport type { AppPage, PlayerColor, GameMode, MatchSettings, GameSettings, Stats };');

// 2. Modals
const modalsContent = importsHeader + "\n" + exportComponent(chunks.ResignModal, "ResignModal") + "\n\n" + exportComponent(chunks.ResultModal, "ResultModal") + "\n\n" + exportComponent(chunks.GameOverModal, "GameOverModal");
fs.writeFileSync(path.join(__dirname, 'src/app/components/Modals.tsx'), modalsContent);

// 3. HomePage
fs.writeFileSync(path.join(__dirname, 'src/app/components/HomePage.tsx'), importsHeader + "\n" + exportComponent(chunks.HomePage, "HomePage"));

// 4. SetupPage
fs.writeFileSync(path.join(__dirname, 'src/app/components/SetupPage.tsx'), importsHeader + "\n" + exportComponent(chunks.SetupPage, "SetupPage"));

// 5. LobbyPage
fs.writeFileSync(path.join(__dirname, 'src/app/components/LobbyPage.tsx'), importsHeader + "\n" + exportComponent(chunks.LobbyPage, "LobbyPage"));

// 6. GamePage
let gamePageContent = importsHeader + "\nimport { ResignModal, ResultModal, GameOverModal } from './Modals';\n" + exportComponent(chunks.GamePage, "GamePage");
fs.writeFileSync(path.join(__dirname, 'src/app/components/GamePage.tsx'), gamePageContent);

// 7. ReviewPage
fs.writeFileSync(path.join(__dirname, 'src/app/components/ReviewPage.tsx'), importsHeader + "\n" + exportComponent(chunks.ReviewPage, "ReviewPage"));

// 8. Rewrite page.tsx
const appImports = `"use client";
import React, { useState, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { HomePage } from "./components/HomePage";
import { SetupPage } from "./components/SetupPage";
import { LobbyPage } from "./components/LobbyPage";
import { GamePage } from "./components/GamePage";
import { ReviewPage } from "./components/ReviewPage";
import { GameSettings, AppPage } from "./types";
`;
const newPageContent = appImports + "\n" + chunks.App;
fs.writeFileSync(path.join(__dirname, 'src/app/page.tsx'), newPageContent);

console.log("Refactoring complete");
