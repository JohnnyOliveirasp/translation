import Nav from '../components/Nav';
import Hero from '../components/Hero';
import TrustedBy from '../components/TrustedBy';
import About from '../components/About';
import Features from '../components/Features';
import HowItWorks from '../components/HowItWorks';
import Testimonials from '../components/Testimonials';
import Pricing from '../components/Pricing';
import FAQ from '../components/FAQ';
import Footer from '../components/Footer';

export default function Landing() {
  return (
    <>
      <Nav />
      <main className="relative z-10">
        <Hero />
        <TrustedBy />
        <About />
        <Features />
        <HowItWorks />
        <Testimonials />
        <Pricing />
        <FAQ />
        <Footer />
      </main>
    </>
  );
}
