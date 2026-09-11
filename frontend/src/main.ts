import { createApp } from 'vue'
import { createPinia } from 'pinia'
// 代码块高亮主题（配合 lowlight 输出的 hljs-* class）
import 'highlight.js/styles/github.css'
import './style.css'
import App from './App.vue'

createApp(App).use(createPinia()).mount('#app')
