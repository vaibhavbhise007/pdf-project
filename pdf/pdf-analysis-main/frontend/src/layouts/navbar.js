// navbar.js
import React from 'react';
import '../styles/Navbar.css';
import Logo from '../assets/logo.png';

const Navbar = () => {
  return (
    <nav className="navbar">
      <div className="navbar-logo">
        <img src={Logo} alt="Logo" />
        <p>PDF Analyzer</p>
      </div>
      <ul className="navbar-links">
        {['Home', 'Features', 'Contact'].map(label => (
          <li key={label}>
            <a href={`#${label.toLowerCase()}`}>{label}</a>
          </li>
        ))}
        <li className="hidden lg:flex items-center space-x-2 text-base">
          <input
            type="text"
            placeholder="Search..."
            className="search-input flex-grow px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button className="search-button px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition">
            Search
          </button>
        </li>


      </ul>
    </nav>
  );
};

export default Navbar;
