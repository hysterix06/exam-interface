"use client";

import { createContext, useContext } from "react";

/** The course a question belongs to, so editors can upload and pick its images. */
const AssetCourse = createContext<string | null>(null);

export const AssetCourseProvider = AssetCourse.Provider;
export const useAssetCourse = () => useContext(AssetCourse);
