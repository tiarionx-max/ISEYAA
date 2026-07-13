import { render, screen } from '@testing-library/react';
import { PageTransition } from '../PageTransition';

describe('PageTransition', () => {
  it('mounts and renders its children under jsdom', () => {
    render(
      <PageTransition>
        <div>hello world</div>
      </PageTransition>,
    );

    expect(screen.getByText('hello world')).toBeInTheDocument();
  });
});
