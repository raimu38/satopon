// 共通スタイルを定義
export const container = `
  w-full min-h-screen flex flex-col items-center
  pt-8 pb-8
  bg-gradient-to-b from-gray-900 via-gray-800 to-gray-700
  overflow-auto
`

export const panel = `
  relative w-full max-w-md
  bg-indigo-900 bg-opacity-20
  backdrop-blur-sm rounded-2xl p-6
`

export const cardGrid = `
  w-full max-w-md
  grid grid-cols-2 gap-4
`

export const cardBase = `
  p-4 rounded-2xl cursor-pointer transition
`

export const historySection = `
  w-full max-w-md mt-8
  bg-indigo-900 bg-opacity-20
  backdrop-blur-sm rounded-2xl p-4 space-y-4
`

export const historyItem = `
  bg-indigo-900 bg-opacity-30
  rounded-2xl p-4 backdrop-blur-sm space-y-2
`

export const modalOverlay = `
  fixed inset-0 flex items-center justify-center
  bg-gradient-to-b from-gray-900 via-gray-800 to-gray-700
`

export const inputBase = `
  w-full px-3 py-2
  bg-indigo-900 bg-opacity-30
  text-white placeholder-indigo-300
  border border-indigo-700
  rounded-2xl
  focus:outline-none focus:ring-2 focus:ring-indigo-500
  transition
`

export const btnBase = `rounded-full font-semibold transition`

export const btnPrimary = `
  ${btnBase}
  px-4 py-2
  bg-gradient-to-tr from-green-400 to-green-600
  hover:from-green-500 hover:to-green-700
  text-white
`

export const btnSecondary = `
  ${btnBase}
  px-4 py-2
  bg-gradient-to-tr from-blue-500 to-indigo-600
  hover:from-blue-600 hover:to-indigo-700
  text-white
`

export const btnTertiary = `
  ${btnBase}
  px-2 py-1
  bg-gray-200 hover:bg-gray-300
  text-gray-800
`
