<template>
  <div class="flex h-screen overflow-hidden">
    <Sidebar />
    
    <div class="flex-1 flex flex-col overflow-hidden">
      <Header />
      
      <main class="flex-1 overflow-y-auto bg-dark-500 p-6">
        <div class="px-4 mx-auto animate-fade-in">
          <RouterView />
        </div>
      </main>
    </div>
  </div>
</template>

<script setup>
import Sidebar from './Sidebar.vue'
import Header from './Header.vue'
</script>
