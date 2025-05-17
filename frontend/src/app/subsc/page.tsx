'use client'
import React from 'react'

const plans = [
  {
    name: 'Free',
    price: 0,
    features: ['1プロジェクト', '基本的な通知機能', 'カスタマーサポートなし'],
    color: 'from-blue-100 to-blue-200',
  },
  {
    name: 'Pro',
    price: 980,
    features: ['5プロジェクト', '通知カスタマイズ', 'メールサポート'],
    recommended: true,
    color: 'from-blue-400 to-blue-600',
  },
  {
    name: 'Enterprise',
    price: 4980,
    features: ['無制限プロジェクト', 'SLA保証', '専用サポート'],
    color: 'from-blue-200 to-blue-400',
  },
]

export default function Pricing() {
  return (
    <section className="bg-gray-100 py-16">
      <div className="max-w-6xl mx-auto px-6 text-center">
        <h2 className="text-4xl font-bold text-gray-800 mb-12">料金プラン</h2>
        <div className="grid md:grid-cols-3 gap-8">
          {plans.map((plan, idx) => (
            <div
              key={idx}
              className={`rounded-xl overflow-hidden shadow-md transform transition-transform duration-300 hover:scale-105
                bg-white border ${
                  plan.recommended
                    ? 'border-blue-500 ring-2 ring-blue-300 shadow-xl'
                    : 'border-gray-200'
                }`}
            >
              <div className={`p-6 bg-gradient-to-br ${plan.color} transition-colors duration-300 hover:from-blue-500 hover:to-blue-700`}>
                <h3 className="text-2xl font-semibold text-white mb-1">{plan.name}</h3>
                <p className="text-4xl font-bold text-white">¥{plan.price}<span className="text-sm"> /月</span></p>
              </div>
              <ul className="bg-white px-6 py-5 text-left space-y-2">
                {plan.features.map((f, i) => (
                  <li key={i} className="text-gray-700">・{f}</li>
                ))}
              </ul>
              <div className="p-6">
                <button
                  className={`w-full py-2 px-4 font-semibold rounded-lg transition-colors duration-200
                    ${
                      plan.recommended
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                    }`}
                >
                  このプランに申し込む
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
