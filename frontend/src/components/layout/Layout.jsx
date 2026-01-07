import Sidebar from './Sidebar';
import Header from './Header';

export default function Layout({ children }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        
        <main className="flex-1 overflow-y-auto bg-dark-500 p-6">
          <div className="px-4 mx-auto animate-fade-in">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
